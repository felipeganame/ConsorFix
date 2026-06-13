import { Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq, sql } from 'drizzle-orm';
import { gasto, ticket } from '../db/schema/index.js';
import { withTenant } from '../db/client.js';

export interface CreateGastoInput {
  descripcion: string;
  monto: number;
  moneda: string;
  comprobanteUrl?: string;
  estado: 'BORRADOR' | 'CONFIRMADO';
}

@Injectable()
export class GastosService {
  async list(tenantId: string, ticketId: string) {
    return withTenant(tenantId, async (tx) => {
      const exists = await tx
        .select({ id: ticket.id })
        .from(ticket)
        .where(and(eq(ticket.tenantId, tenantId), eq(ticket.id, ticketId)))
        .limit(1);
      if (!exists[0]) throw new NotFoundException('ticket not found');
      return tx
        .select()
        .from(gasto)
        .where(and(eq(gasto.tenantId, tenantId), eq(gasto.ticketId, ticketId)))
        .orderBy(desc(gasto.createdAt));
    });
  }

  async create(tenantId: string, adminId: string, ticketId: string, input: CreateGastoInput) {
    return withTenant(tenantId, async (tx) => {
      const t = (
        await tx
          .select()
          .from(ticket)
          .where(and(eq(ticket.tenantId, tenantId), eq(ticket.id, ticketId)))
          .limit(1)
      )[0];
      if (!t) throw new NotFoundException('ticket not found');
      return (
        await tx
          .insert(gasto)
          .values({
            tenantId,
            ticketId,
            descripcion: input.descripcion,
            monto: input.monto.toFixed(2),
            moneda: input.moneda,
            comprobanteUrl: input.comprobanteUrl ?? null,
            estado: input.estado,
            cargadoPorId: adminId,
          })
          .returning()
      )[0];
    });
  }

  async totalConfirmado(tenantId: string, ticketId: string): Promise<{ moneda: string; total: number }[]> {
    return withTenant(tenantId, async (tx) => {
      const rows = await tx
        .select({
          moneda: gasto.moneda,
          total: sql<string>`coalesce(sum(${gasto.monto}), 0)::text`,
        })
        .from(gasto)
        .where(
          and(
            eq(gasto.tenantId, tenantId),
            eq(gasto.ticketId, ticketId),
            eq(gasto.estado, 'CONFIRMADO'),
          ),
        )
        .groupBy(gasto.moneda);
      return rows.map((r) => ({ moneda: r.moneda, total: Number(r.total) }));
    });
  }
}
