import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq } from 'drizzle-orm';
import { assertTransition, canResidenteSeeTicket, type TicketState } from '@consorciofix/domain';
import { categoria, clasificacionIa, consorcio, ticket, ticketEvento, unidad } from '../db/schema/index.js';
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
  /** Admin que lo carga a mano, cuando no hay reportante. */
  creadoPorAdminId?: string;
}

/**
 * Columnas del ticket que se exponen por HTTP.
 *
 * Existe para dejar afuera `embedding`: es un vector de 384 floats que sirve
 * para el dedup del lado del servidor y que ningún cliente usa, pero
 * `select()` lo traía igual y se serializaba como ~877 bytes por ticket. En un
 * consorcio con tickets creados por el bot era casi la mitad del peso de la
 * bandeja (medido: 47% de la respuesta).
 */
const COLUMNAS_PUBLICAS = {
  id: ticket.id,
  tenantId: ticket.tenantId,
  consorcioId: ticket.consorcioId,
  unidadId: ticket.unidadId,
  unidadReportadaId: ticket.unidadReportadaId,
  reportanteId: ticket.reportanteId,
  tipo: ticket.tipo,
  origen: ticket.origen,
  urgencia: ticket.urgencia,
  estado: ticket.estado,
  titulo: ticket.titulo,
  descripcionNormalizada: ticket.descripcionNormalizada,
  clientGeneratedId: ticket.clientGeneratedId,
  shortCode: ticket.shortCode,
  votosCount: ticket.votosCount,
  categoriaId: ticket.categoriaId,
  duplicadoDeId: ticket.duplicadoDeId,
  createdAt: ticket.createdAt,
  validatedAt: ticket.validatedAt,
  solucionadoAt: ticket.solucionadoAt,
  updatedAt: ticket.updatedAt,
} as const;

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

      // El consorcio DEBE pertenecer al tenant. RLS no alcanza acá: filtra las
      // filas por `tenant_id`, pero no valida que la FK apunte dentro del mismo
      // tenant. Sin este chequeo, un admin podía crear un ticket en SU tenant
      // apuntando al consorcio de OTRO — no filtra datos, pero deja la base
      // incoherente y cualquier join posterior expone el nombre del consorcio
      // ajeno. Verificado explotable antes de este chequeo.
      const consorcioPropio = (
        await tx
          .select({ id: consorcio.id })
          .from(consorcio)
          .where(and(eq(consorcio.tenantId, tenantId), eq(consorcio.id, input.consorcioId)))
          .limit(1)
      )[0];
      if (!consorcioPropio) throw new NotFoundException('consorcio not found');

      // Pertenencia (RF-H03): el reportante solo puede crear tickets en un
      // consorcio donde tenga vínculo activo, y la unidad imputada debe
      // pertenecer a ese consorcio. Sin esto un residente podía crear tickets
      // —incluso de CONDUCTA— en consorcios ajenos, imputando cualquier unidad.
      //
      // Ojo: NO se exige que sea ocupante de `unidadId`. En CONDUCTA la unidad
      // es justamente la del vecino denunciado, y en infraestructura uno puede
      // reportar la filtración de otra unidad. El consorcio es el límite real.
      // La unidad se valida SIEMPRE, no solo cuando hay reportante. Estaba
      // dentro del `if (input.reportanteId)`, y el admin manda reportanteId
      // null, así que por ese camino se salteaba entera: podía imputar una
      // unidad de otro consorcio o de otro tenant. En CONDUCTA la unidad
      // imputada ES la acusación, así que imputar una ajena es grave.
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

      if (input.reportanteId) {
        const ctx = await loadResidenteCtx(tx, tenantId, input.reportanteId);
        if (!ctx.consorcioIds.has(input.consorcioId)) {
          throw new ForbiddenException('sin vínculo activo en ese consorcio');
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
      // El autor real: si no hay reportante, lo cargó el admin a mano. Decir
      // 'RESIDENTE' con autorId null en un historial que RF-D02 quiere
      // auditable es directamente registrar mal quién hizo qué.
      await this.recordEvent(
        tx,
        tenantId,
        t.id,
        'CREATE',
        null,
        'REGISTRADO',
        input.reportanteId ?? input.creadoPorAdminId ?? null,
        input.reportanteId ? 'RESIDENTE' : 'ADMIN',
        null,
      );
      return t;
    });
  }

  async list(tenantId: string, opts: { consorcioId?: string; estado?: TicketState } = {}) {
    return withTenant(tenantId, async (tx) => {
      const conds = [eq(ticket.tenantId, tenantId)];
      if (opts.consorcioId) conds.push(eq(ticket.consorcioId, opts.consorcioId));
      if (opts.estado) conds.push(eq(ticket.estado, opts.estado));
      return tx
        .select(COLUMNAS_PUBLICAS)
        .from(ticket)
        .where(and(...conds))
        .orderBy(desc(ticket.createdAt))
        .limit(200);
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
      const rows = await tx
        .select(COLUMNAS_PUBLICAS)
        .from(ticket)
        .where(and(eq(ticket.tenantId, tenantId), eq(ticket.id, id)))
        .limit(1);
      const t = rows[0];
      if (!t) throw new NotFoundException('ticket not found');

      if (viewer.kind !== 'RESIDENTE') {
        // La sugerencia de la IA va SOLO al admin, y solo acá: es lo que la
        // regla 4 le pide decidir, y hasta ahora el panel no la recibía nunca
        // —mostraba una confianza fija del 85% y derivaba la "categoría
        // sugerida" de los campos ya confirmados, o sea de su propia decisión.
        // Al residente no se le expone: en CONDUCTA el `sugerido` contiene el
        // texto crudo del denunciante y la unidad que el modelo dedujo.
        const ia = (
          await tx
            .select({
              sugerido: clasificacionIa.sugerido,
              corregidoPorAdmin: clasificacionIa.corregidoPorAdmin,
              confianza: clasificacionIa.confianza,
              modelo: clasificacionIa.modelo,
              promptVersion: clasificacionIa.promptVersion,
              tokensIn: clasificacionIa.tokensIn,
              tokensOut: clasificacionIa.tokensOut,
              costoUsd: clasificacionIa.costoUsd,
              latenciaMs: clasificacionIa.latenciaMs,
              cacheHit: clasificacionIa.cacheHit,
            })
            .from(clasificacionIa)
            .where(and(eq(clasificacionIa.tenantId, tenantId), eq(clasificacionIa.ticketId, id)))
            .limit(1)
        )[0];
        // `null` explícito y no ausencia: un ticket cargado a mano por el admin
        // no pasó por el clasificador, y el panel tiene que poder distinguirlo
        // de "todavía no llegó".
        return { ...t, clasificacion: ia ?? null };
      }

      const ctx = await loadResidenteCtx(tx, tenantId, viewer.residenteId);
      const visible = canResidenteSeeTicket(ctx, {
        tipo: t.tipo,
        origen: t.origen,
        unidadId: t.unidadId,
        unidadReportadaId: t.unidadReportadaId,
        reportanteId: t.reportanteId,
        consorcioId: t.consorcioId,
      });
      if (!visible) throw new NotFoundException('ticket not found');

      return { ...t, reportanteId: t.tipo === 'CONDUCTA' ? null : t.reportanteId };
    });
  }

  /**
   * Historial del ticket (RF-D02).
   *
   * `ticket_evento` se venía escribiendo desde el principio y no había ningún
   * endpoint que lo leyera: un historial inconsultable no es auditable, que es
   * justamente lo que el RF pide.
   *
   * Para un RESIDENTE se aplica la misma visibilidad que al ticket, y se omite
   * el autor de los eventos: en CONDUCTA el autor del evento de creación ES el
   * denunciante, así que exponerlo filtraría por la puerta de atrás lo mismo
   * que el feed se toma el trabajo de ocultar.
   */
  async historial(tenantId: string, ticketId: string, viewer: TicketViewer) {
    return withTenant(tenantId, async (tx) => {
      const t = (
        await tx
          .select()
          .from(ticket)
          .where(and(eq(ticket.tenantId, tenantId), eq(ticket.id, ticketId)))
          .limit(1)
      )[0];
      if (!t) throw new NotFoundException('ticket not found');

      const esAdmin = viewer.kind !== 'RESIDENTE';
      if (!esAdmin) {
        const ctx = await loadResidenteCtx(tx, tenantId, viewer.residenteId);
        const visible = canResidenteSeeTicket(ctx, {
          tipo: t.tipo,
          origen: t.origen,
          unidadId: t.unidadId,
          unidadReportadaId: t.unidadReportadaId,
          reportanteId: t.reportanteId,
          consorcioId: t.consorcioId,
        });
        if (!visible) throw new NotFoundException('ticket not found');
      }

      const eventos = await tx
        .select()
        .from(ticketEvento)
        .where(and(eq(ticketEvento.tenantId, tenantId), eq(ticketEvento.ticketId, ticketId)))
        .orderBy(ticketEvento.at);

      // En CONDUCTA se recorta más: los ocupantes de la unidad ACUSADA ven el
      // ticket, así que la `nota` libre del admin ("descarto, el del 3B se
      // queja de todo") les llegaría entera. Y `autorTipo: 'RESIDENTE'` en el
      // evento de creación le confirma al acusado que lo denunció un vecino y
      // no la administración. El módulo se toma el trabajo de anonimizar al
      // denunciante; dejar el texto libre abierto lo desarma.
      const esConducta = t.tipo === 'CONDUCTA';
      return eventos.map((e) => ({
        transicion: e.transicion,
        estadoAnterior: e.estadoAnterior,
        estadoNuevo: e.estadoNuevo,
        // La nota es SOLO del admin, en todo tipo de ticket.
        //
        // Antes se ocultaba nada más en CONDUCTA, así que en un ticket de
        // infraestructura un residente que pidiera el historial leía la nota
        // interna. El panel la pide bajo el rótulo "NOTA INTERNA — contexto para
        // el equipo": si el vecino puede leerla, el rótulo miente, y quien la
        // escribe cree que está en privado. Es un campo de texto libre, así que
        // no se puede confiar en que quien lo llena se autocensure.
        //
        // Si algún día hace falta un comentario que el vecino SÍ vea, va en otro
        // campo con su propio rótulo. Un mismo texto libre no puede servir para
        // las dos cosas.
        ...(esAdmin ? { nota: e.nota } : {}),
        // `autorTipo: 'RESIDENTE'` en el evento de creación le confirma al
        // acusado que lo denunció un vecino y no la administración, así que en
        // conducta sigue oculto.
        ...(esAdmin || !esConducta ? { autorTipo: e.autorTipo } : {}),
        ...(esAdmin ? { autorId: e.autorId } : {}),
        at: e.at,
      }));
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
    opts: {
      nota?: string;
      origen?: 'UNIDAD' | 'ESPACIO_COMUN';
      categoriaId?: string;
      unidadReportadaId?: string;
    } = {},
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

      // RF-F01 opción A: en CONDUCTA el admin confirma a quién se acusa. La IA
      // pudo sugerirlo desde el texto ("el del 5B"), pero atribuirle una
      // denuncia a un vecino por una deducción del modelo es justo lo que la
      // regla 4 prohíbe: acá decide una persona.
      //
      // Sin unidad acusada el ticket es inservible: no lo ve nadie y no se le
      // pueden registrar avisos ni sanciones (P5). Por eso se exige, y además
      // hay un CHECK en la base que lo respalda (migración 0004).
      const unidadReportada = opts.unidadReportadaId ?? t.unidadReportadaId;
      if (to === 'VALIDADO' && t.tipo === 'CONDUCTA' && !unidadReportada) {
        throw new BadRequestException(
          'validar una CONDUCTA requiere `unidad_reportada_id`: la unidad del vecino señalado',
        );
      }
      // La categoría también tiene que ser del tenant Y del consorcio del
      // ticket. Sin esto, el admin podía apuntar `categoria_id` a una categoría
      // ajena, y en el mismo request ese id se copiaba a
      // `clasificacion_ia.corregido_por_admin` — o sea que la contaminación
      // quedaba persistida en dos tablas, una de ellas el dataset de G16.
      if (opts.categoriaId) {
        const cat = (
          await tx
            .select({ consorcioId: categoria.consorcioId })
            .from(categoria)
            .where(and(eq(categoria.tenantId, tenantId), eq(categoria.id, opts.categoriaId)))
            .limit(1)
        )[0];
        if (!cat) throw new BadRequestException('categoría inexistente');
        if (cat.consorcioId && cat.consorcioId !== t.consorcioId) {
          throw new BadRequestException('la categoría no pertenece al consorcio del ticket');
        }
      }

      if (opts.unidadReportadaId) {
        const u = (
          await tx
            .select({ consorcioId: unidad.consorcioId })
            .from(unidad)
            .where(and(eq(unidad.tenantId, tenantId), eq(unidad.id, opts.unidadReportadaId)))
            .limit(1)
        )[0];
        if (!u) throw new BadRequestException('unidad reportada inexistente');
        if (u.consorcioId !== t.consorcioId) {
          throw new BadRequestException('la unidad reportada no pertenece al consorcio del ticket');
        }
      }

      const patch: Partial<typeof ticket.$inferInsert> = { estado: to };
      if (to === 'VALIDADO') {
        patch.validatedAt = new Date();
        if (opts.origen) patch.origen = opts.origen;
        if (opts.categoriaId) patch.categoriaId = opts.categoriaId;
        if (opts.unidadReportadaId) patch.unidadReportadaId = opts.unidadReportadaId;
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
        if (opts.unidadReportadaId && opts.unidadReportadaId !== t.unidadReportadaId) {
          correccion['unidadReportadaId'] = {
            sugerido: t.unidadReportadaId,
            final: opts.unidadReportadaId,
          };
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
