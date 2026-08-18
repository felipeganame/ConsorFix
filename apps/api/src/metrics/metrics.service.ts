import { Injectable } from '@nestjs/common';
import { and, eq, isNotNull, sql } from 'drizzle-orm';
import { clasificacionIa, gasto, ticket } from '../db/schema/index.js';
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

      // Costo de IA (RF-C07). Responde una pregunta de negocio directa: cuánto
      // sale clasificar un ticket, que es lo que define si el precio del SaaS
      // cierra. El join va por ticket para que el filtro por consorcio aplique
      // igual que en el resto de las métricas.
      const costoIa = (
        await tx
          .select({
            tickets: sql<number>`count(*)::int`,
            tokensIn: sql<number>`coalesce(sum(${clasificacionIa.tokensIn}), 0)::int`,
            tokensOut: sql<number>`coalesce(sum(${clasificacionIa.tokensOut}), 0)::int`,
            totalUsd: sql<string>`coalesce(sum(${clasificacionIa.costoUsd}), 0)::text`,
            promedioUsd: sql<string>`coalesce(avg(${clasificacionIa.costoUsd}), 0)::text`,
            latenciaP50Ms: sql<number>`coalesce(percentile_cont(0.5) within group (order by ${clasificacionIa.latenciaMs}), 0)::int`,
            corregidosPorAdmin: sql<number>`count(${clasificacionIa.corregidoPorAdmin})::int`,
          })
          .from(clasificacionIa)
          .innerJoin(ticket, eq(ticket.id, clasificacionIa.ticketId))
          .where(baseCond)
      )[0];

      return {
        byEstado,
        byUrgencia,
        avgResolutionMinutes: ttrRows[0]?.avgMinutes ?? null,
        costosConfirmados: gastosRows.map((g) => ({ moneda: g.moneda, total: Number(g.total) })),
        costoIa: {
          ticketsClasificados: costoIa?.tickets ?? 0,
          tokensIn: costoIa?.tokensIn ?? 0,
          tokensOut: costoIa?.tokensOut ?? 0,
          totalUsd: Number(costoIa?.totalUsd ?? 0),
          promedioPorTicketUsd: Number(costoIa?.promedioUsd ?? 0),
          latenciaP50Ms: costoIa?.latenciaP50Ms ?? 0,
          // Tasa de corrección del admin: qué tan seguido la IA se equivoca.
          // Es la métrica que alimenta el dataset de casos reales (G16).
          corregidosPorAdmin: costoIa?.corregidosPorAdmin ?? 0,
        },
      };
    });
  }
}
