import { Injectable } from '@nestjs/common';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { canResidenteSeeCosto, canResidenteSeeTicket } from '@consorciofix/domain';
import { gasto, ticket, unidad, vinculoResidente, voto } from '../db/schema/index.js';
import { withTenant } from '../db/client.js';

@Injectable()
export class MeService {
  /**
   * Listado del residente con visibilidad row-level aplicada en JS
   * (la matriz se evalúa con canResidenteSeeTicket de `packages/domain`).
   * - común: visible a todos los del consorcio
   * - unidad infra: solo ocupantes activos
   * - conducta: solo ocupantes de unidad reportada
   *
   * Reportante.id NO se expone en el feed (anonimato conducta — RF-F02).
   */
  async listFeed(tenantId: string, residenteId: string) {
    return withTenant(tenantId, async (tx) => {
      const vinculos = await tx
        .select({ unidadId: vinculoResidente.unidadId, consorcioId: unidad.consorcioId })
        .from(vinculoResidente)
        .innerJoin(unidad, eq(unidad.id, vinculoResidente.unidadId))
        .where(
          and(
            eq(vinculoResidente.tenantId, tenantId),
            eq(vinculoResidente.residenteId, residenteId),
            eq(vinculoResidente.activo, true),
          ),
        );
      const consorcioIds = new Set(vinculos.map((v) => v.consorcioId));
      const unidadIds = new Set(vinculos.map((v) => v.unidadId));
      if (consorcioIds.size === 0) return [];

      const tickets = await tx
        .select()
        .from(ticket)
        .where(
          and(
            eq(ticket.tenantId, tenantId),
            inArray(ticket.consorcioId, Array.from(consorcioIds)),
          ),
        )
        .orderBy(desc(ticket.createdAt))
        .limit(500);

      const visible = tickets.filter((t) =>
        canResidenteSeeTicket(
          { residenteId, consorcioIds, unidadIds },
          { tipo: t.tipo, origen: t.origen, unidadId: t.unidadId, unidadReportadaId: t.unidadReportadaId, reportanteId: t.reportanteId, consorcioId: t.consorcioId },
        ),
      );

      // Strip reportanteId para tickets de conducta (anonimato RF-F02).
      // No-conducta lo mantienen para que el ocupante sepa quién reportó su unidad.
      const myVotos = await tx
        .select({ ticketId: voto.ticketId })
        .from(voto)
        .where(and(eq(voto.tenantId, tenantId), eq(voto.residenteId, residenteId)));
      const votedSet = new Set(myVotos.map((v) => v.ticketId));

      // Costos confirmados visibles (G10 / RF-D05 / RF-E02): solo de tickets
      // ESPACIO_COMUN que el residente puede ver. Privacidad de unidad/conducta
      // se resuelve en `canResidenteSeeCosto` (packages/domain).
      const costoTicketIds = visible
        .filter((t) =>
          canResidenteSeeCosto(
            { residenteId, consorcioIds, unidadIds },
            { tipo: t.tipo, origen: t.origen, unidadId: t.unidadId, unidadReportadaId: t.unidadReportadaId, reportanteId: t.reportanteId, consorcioId: t.consorcioId },
          ),
        )
        .map((t) => t.id);

      const costoByTicket = new Map<string, Array<{ moneda: string; total: number }>>();
      if (costoTicketIds.length > 0) {
        const rows = await tx
          .select({
            ticketId: gasto.ticketId,
            moneda: gasto.moneda,
            total: sql<string>`coalesce(sum(${gasto.monto}), 0)::text`,
          })
          .from(gasto)
          .where(
            and(
              eq(gasto.tenantId, tenantId),
              eq(gasto.estado, 'CONFIRMADO'),
              inArray(gasto.ticketId, costoTicketIds),
            ),
          )
          .groupBy(gasto.ticketId, gasto.moneda);
        for (const r of rows) {
          const arr = costoByTicket.get(r.ticketId) ?? [];
          arr.push({ moneda: r.moneda, total: Number(r.total) });
          costoByTicket.set(r.ticketId, arr);
        }
      }

      return visible.map((t) => ({
        id: t.id,
        consorcioId: t.consorcioId,
        unidadId: t.unidadId,
        unidadReportadaId: t.unidadReportadaId,
        tipo: t.tipo,
        origen: t.origen,
        urgencia: t.urgencia,
        estado: t.estado,
        titulo: t.titulo,
        descripcionNormalizada: t.descripcionNormalizada,
        votosCount: t.votosCount,
        reportanteId: t.tipo === 'CONDUCTA' ? null : t.reportanteId,
        voted: votedSet.has(t.id),
        // null cuando el costo no es visible (unidad/conducta); [] si es común sin costo aún.
        costosConfirmados: costoByTicket.has(t.id)
          ? costoByTicket.get(t.id)!
          : costoTicketIds.includes(t.id)
            ? []
            : null,
        createdAt: t.createdAt,
        validatedAt: t.validatedAt,
        solucionadoAt: t.solucionadoAt,
      }));
    });
  }
}
