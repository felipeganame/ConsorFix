import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq } from 'drizzle-orm';
import { assertTransition, type TicketState } from '@consorciofix/domain';
import { ticket, ticketEvento } from '../db/schema/index.js';
import type { TxClient } from '../db/client.js';
import { db, withTenant } from '../db/client.js';
import { AuditService } from '../audit/audit.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';

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

  async byId(tenantId: string, id: string) {
    return withTenant(tenantId, async (tx) => {
      const rows = await tx.select().from(ticket).where(and(eq(ticket.tenantId, tenantId), eq(ticket.id, id))).limit(1);
      const t = rows[0];
      if (!t) throw new NotFoundException('ticket not found');
      return t;
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
