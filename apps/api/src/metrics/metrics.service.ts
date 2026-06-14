import { Injectable } from '@nestjs/common';
import { and, eq, isNotNull, sql } from 'drizzle-orm';
import { gasto, ticket } from '../db/schema/index.js';
import { withTenant } from '../db/client.js';

@Injectable()
export class MetricsService {
  async overview(tenantId: string, consorcioId?: string) {
    return withTenant(tenantId, async (tx) => {
      const baseCond = consorcioId
        ? and(eq(ticket.tenantId, tenantId), eq(ticket.consorcioId, consorcioId))
        : eq(ticket.tenantId, tenantId);

      const byEstado = await tx
        .select({
          estado: ticket.estado,
          count: sql<number>`count(*)::int`,
        })
        .from(ticket)
        .where(baseCond)
        .groupBy(ticket.estado);

      const byUrgencia = await tx
        .select({
          urgencia: ticket.urgencia,
          count: sql<number>`count(*)::int`,
        })
        .from(ticket)
        .where(baseCond)
        .groupBy(ticket.urgencia);

      // tiempo medio de resolución en minutos (sólo solucionados).
      const ttrRows = await tx
        .select({
          avgMinutes: sql<number>`extract(epoch from avg(${ticket.solucionadoAt} - ${ticket.createdAt})) / 60`,
        })
        .from(ticket)
        .where(
          and(
            baseCond ?? eq(ticket.tenantId, tenantId),
            eq(ticket.estado, 'SOLUCIONADO'),
            isNotNull(ticket.solucionadoAt),
          ),
        );

      // costo acumulado confirmado. Se filtra por consorcio vía join con ticket
      // (gasto no tiene consorcio_id propio; cuelga del ticket).
      const gastoConds = [eq(gasto.tenantId, tenantId), eq(gasto.estado, 'CONFIRMADO')];
      if (consorcioId) gastoConds.push(eq(ticket.consorcioId, consorcioId));
      const gastosRows = await tx
        .select({
          moneda: gasto.moneda,
          total: sql<string>`coalesce(sum(${gasto.monto}), 0)::text`,
        })
        .from(gasto)
        .innerJoin(ticket, eq(ticket.id, gasto.ticketId))
        .where(and(...gastoConds))
        .groupBy(gasto.moneda);

      return {
        byEstado,
        byUrgencia,
        avgResolutionMinutes: ttrRows[0]?.avgMinutes ?? null,
        costosConfirmados: gastosRows.map((g) => ({ moneda: g.moneda, total: Number(g.total) })),
      };
    });
  }
}
