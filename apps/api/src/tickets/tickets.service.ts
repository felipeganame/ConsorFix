import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq } from 'drizzle-orm';
import { assertTransition, canResidenteSeeTicket, type TicketState } from '@consorciofix/domain';
import { clasificacionIa, ticket, ticketEvento, unidad } from '../db/schema/index.js';
import type { TxClient } from '../db/client.js';
import { db, withTenant } from '../db/client.js';
import { loadResidenteCtx } from '../common/residente-ctx.js';
import { AuditService } from '../audit/audit.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';

/** Quién pide el recurso. Un RESIDENTE queda sujeto a la matriz row-level. */
export type TicketViewer =
  | { kind: 'SUPER_ADMIN' | 'ADMIN' }
  | { kind: 'RESIDENTE'; residenteId: string };

export interface CreateTicketInput {
  consorcioId: string;
  unidadId: string | null;
  reportanteId: string | null;
  tipo: 'INFRAESTRUCTURA' | 'CONDUCTA';
  urgencia: 'CRITICA' | 'ALTA' | 'MEDIA' | 'BAJA';
  origenSugerido?: 'UNIDAD' | 'ESPACIO_COMUN';
  titulo: string;
  descripcionNormalizada: string;
  clientGeneratedId?: string;
}

@Injectable()
export class TicketsService {
  constructor(
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
  ) {}

  async create(tenantId: string, input: CreateTicketInput) {
    return withTenant(tenantId, async (tx) => {
      // Idempotencia por client_generated_id (RF-E05 / RNF-11).
      if (input.clientGeneratedId) {
        const existing = await tx
          .select()
          .from(ticket)
          .where(and(eq(ticket.tenantId, tenantId), eq(ticket.clientGeneratedId, input.clientGeneratedId)))
          .limit(1);
        if (existing[0]) return existing[0];
      }

      // Pertenencia (RF-H03): el reportante solo puede crear tickets en un
      // consorcio donde tenga vínculo activo, y la unidad imputada debe
      // pertenecer a ese consorcio. Sin esto un residente podía crear tickets
      // —incluso de CONDUCTA— en consorcios ajenos, imputando cualquier unidad.
      //
      // Ojo: NO se exige que sea ocupante de `unidadId`. En CONDUCTA la unidad
      // es justamente la del vecino denunciado, y en infraestructura uno puede
      // reportar la filtración de otra unidad. El consorcio es el límite real.
      if (input.reportanteId) {
        const ctx = await loadResidenteCtx(tx, tenantId, input.reportanteId);
        if (!ctx.consorcioIds.has(input.consorcioId)) {
          throw new ForbiddenException('sin vínculo activo en ese consorcio');
        }
        if (input.unidadId) {
          const u = (
            await tx
              .select({ consorcioId: unidad.consorcioId })
              .from(unidad)
              .where(and(eq(unidad.tenantId, tenantId), eq(unidad.id, input.unidadId)))
              .limit(1)
          )[0];
          if (!u) throw new BadRequestException('unidad inexistente');
          if (u.consorcioId !== input.consorcioId) {
            throw new BadRequestException('la unidad no pertenece a ese consorcio');
          }
        }
      }

      const inserted = await tx
        .insert(ticket)
        .values({
          tenantId,
          consorcioId: input.consorcioId,
          unidadId: input.unidadId,
          reportanteId: input.reportanteId,
          tipo: input.tipo,
          urgencia: input.urgencia,
          origen: input.origenSugerido ?? null,
          estado: 'REGISTRADO',
          titulo: input.titulo,
          descripcionNormalizada: input.descripcionNormalizada,
          clientGeneratedId: input.clientGeneratedId ?? null,
        })
        .returning();
      const t = inserted[0]!;
      await this.recordEvent(tx, tenantId, t.id, 'CREATE', null, 'REGISTRADO', input.reportanteId, 'RESIDENTE', null);
      return t;
    });
  }

  async list(tenantId: string, opts: { consorcioId?: string; estado?: TicketState } = {}) {
    return withTenant(tenantId, async (tx) => {
      const conds = [eq(ticket.tenantId, tenantId)];
      if (opts.consorcioId) conds.push(eq(ticket.consorcioId, opts.consorcioId));
      if (opts.estado) conds.push(eq(ticket.estado, opts.estado));
      return tx.select().from(ticket).where(and(...conds)).orderBy(desc(ticket.createdAt)).limit(200);
    });
  }

  /**
   * Detalle de un ticket.
   *
   * Para un RESIDENTE aplica la misma matriz row-level que el feed
   * (`canResidenteSeeTicket`) y proyecta el resultado ocultando la identidad
   * del reportante en tickets de CONDUCTA (RF-F02). Sin esto el endpoint
   * devolvía la fila cruda a cualquier autenticado: un residente podía leer
   * cualquier ticket del tenant —incluso de otro consorcio— y, en conducta,
   * averiguar quién lo denunció.
   *
   * Cuando el ticket existe pero no es visible se responde 404 y no 403:
   * un 403 confirmaría su existencia, que ya es información.
   */
  async byId(tenantId: string, id: string, viewer: TicketViewer) {
    return withTenant(tenantId, async (tx) => {
      const rows = await tx.select().from(ticket).where(and(eq(ticket.tenantId, tenantId), eq(ticket.id, id))).limit(1);
      const t = rows[0];
      if (!t) throw new NotFoundException('ticket not found');

      if (viewer.kind !== 'RESIDENTE') return t;

      const ctx = await loadResidenteCtx(tx, tenantId, viewer.residenteId);
      const visible = canResidenteSeeTicket(ctx, {
        tipo: t.tipo,
        origen: t.origen,
        unidadId: t.unidadId,
        consorcioId: t.consorcioId,
      });
      if (!visible) throw new NotFoundException('ticket not found');

      return { ...t, reportanteId: t.tipo === 'CONDUCTA' ? null : t.reportanteId };
    });
  }

  /**
   * Transición de estado por el admin. La máquina de estados vive en
   * `packages/domain` y es la ÚNICA forma legítima de cambiar `estado`.
   * Después del commit, dispara notificaciones (RF-G01/G03) — fire-and-forget,
   * no bloquea ni rompe la transición si la mensajería falla.
   */
  async transition(
    tenantId: string,
    adminId: string,
    id: string,
    to: TicketState,
    opts: { nota?: string; origen?: 'UNIDAD' | 'ESPACIO_COMUN'; categoriaId?: string } = {},
  ) {
    const updated = await withTenant(tenantId, async (tx) => {
      const rows = await tx.select().from(ticket).where(and(eq(ticket.tenantId, tenantId), eq(ticket.id, id))).limit(1);
      const t = rows[0];
      if (!t) throw new NotFoundException('ticket not found');

      assertTransition(t.estado as TicketState, to);

      // VALIDADO requiere que el admin confirme el origen (visibilidad depende de esto).
      if (to === 'VALIDADO' && !opts.origen && !t.origen) {
        throw new BadRequestException('VALIDADO requiere `origen` (UNIDAD | ESPACIO_COMUN)');
      }

      const patch: Partial<typeof ticket.$inferInsert> = { estado: to };
      if (to === 'VALIDADO') {
        patch.validatedAt = new Date();
        if (opts.origen) patch.origen = opts.origen;
        if (opts.categoriaId) patch.categoriaId = opts.categoriaId;
      }
      if (to === 'SOLUCIONADO') patch.solucionadoAt = new Date();

      const next = (await tx
        .update(ticket)
        .set(patch)
        .where(and(eq(ticket.tenantId, tenantId), eq(ticket.id, id)))
        .returning())[0]!;
      await this.recordEvent(tx, tenantId, id, `${t.estado}->${to}`, t.estado, to, adminId, 'ADMIN', opts.nota ?? null);

      // RF-C04: registrar qué corrigió el admin sobre la sugerencia de la IA.
      // Es la mitad que faltaba del dataset — sin el par sugerido/corregido no
      // hay forma de medir el clasificador contra casos reales (G16), ni de
      // sostener el principio "la IA sugiere, el admin decide" (regla 4).
      // Solo se escribe cuando efectivamente hubo un cambio.
      if (to === 'VALIDADO') {
        const correccion: Record<string, unknown> = {};
        if (opts.origen && opts.origen !== t.origen) {
          correccion['origen'] = { sugerido: t.origen, final: opts.origen };
        }
        if (opts.categoriaId && opts.categoriaId !== t.categoriaId) {
          correccion['categoriaId'] = { sugerido: t.categoriaId, final: opts.categoriaId };
        }
        if (Object.keys(correccion).length > 0) {
          await tx
            .update(clasificacionIa)
            .set({
              corregidoPorAdmin: { ...correccion, adminId, at: new Date().toISOString() },
              updatedAt: new Date(),
            })
            .where(and(eq(clasificacionIa.tenantId, tenantId), eq(clasificacionIa.ticketId, id)));
        }
      }

      return next;
    });

    // Auditoría (RF-H05) — fire-and-forget, no rompe flujo si falla.
    void this.audit.record({
      tenantId,
      actorId: adminId,
      actorTipo: 'ADMIN',
      accion: `ticket.${to.toLowerCase()}`,
      entidad: 'ticket',
      entidadId: updated.id,
      detalle: {
        from: updated.estado === to ? null : 'previous',
        to,
        ...(opts.nota && { nota: opts.nota }),
        ...(opts.origen && { origen: opts.origen }),
      },
    });

    // Best-effort notification fire-and-forget; failures logged in NotificationsService.
    setImmediate(() => {
      void this.notifications.notifyTransition({
        tenantId,
        ticketId: updated.id,
        shortCode: updated.id.slice(0, 8),
        to,
        nota: opts.nota ?? null,
        reportanteId: updated.reportanteId,
      });
    });

    return updated;
  }

  private async recordEvent(
    tx: TxClient,
    tenantId: string,
    ticketId: string,
    transicion: string,
    from: string | null,
    to: string,
    autorId: string | null,
    autorTipo: 'ADMIN' | 'SISTEMA' | 'BOT' | 'RESIDENTE',
    nota: string | null,
  ) {
    await tx.insert(ticketEvento).values({
      tenantId,
      ticketId,
      transicion,
      estadoAnterior: from,
      estadoNuevo: to,
      autorId,
      autorTipo,
      nota,
    });
  }
}
// silence unused import warning if optimizer drops db.
void db;
