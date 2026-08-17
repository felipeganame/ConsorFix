import { Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq, sql } from 'drizzle-orm';
import { canResidenteSeeCosto } from '@consorciofix/domain';
import { gasto, ticket } from '../db/schema/index.js';
import { withTenant } from '../db/client.js';
import { loadResidenteCtx } from '../common/residente-ctx.js';

/** Quién consulta los costos. Un RESIDENTE queda sujeto a G10. */
export type GastoViewer =
  | { kind: 'SUPER_ADMIN' | 'ADMIN' }
  | { kind: 'RESIDENTE'; residenteId: string };

export interface CreateGastoInput {
  descripcion: string;
  monto: number;
  moneda: string;
  comprobanteUrl?: string;
  estado: 'BORRADOR' | 'CONFIRMADO';
}

@Injectable()
export class GastosService {
  /**
   * Gastos de un ticket.
   *
   * Para un RESIDENTE se aplica G10 (`canResidenteSeeCosto`: solo espacios
   * comunes) y se fuerza `estado = CONFIRMADO`. El BORRADOR existe justamente
   * para que el admin cargue montos tentativos sin publicarlos, así que
   * exponerlo —junto con la URL del comprobante— era una fuga doble.
   */
  async list(tenantId: string, ticketId: string, viewer: GastoViewer) {
    return withTenant(tenantId, async (tx) => {
      const t = (
        await tx
          .select()
          .from(ticket)
          .where(and(eq(ticket.tenantId, tenantId), eq(ticket.id, ticketId)))
          .limit(1)
      )[0];
      if (!t) throw new NotFoundException('ticket not found');

      const conds = [eq(gasto.tenantId, tenantId), eq(gasto.ticketId, ticketId)];

      if (viewer.kind === 'RESIDENTE') {
        const ctx = await loadResidenteCtx(tx, tenantId, viewer.residenteId);
        const puede = canResidenteSeeCosto(ctx, {
          tipo: t.tipo,
          origen: t.origen,
          unidadId: t.unidadId,
          consorcioId: t.consorcioId,
        });
        // 404 y no 403: un 403 confirmaría que el ticket existe.
        if (!puede) throw new NotFoundException('ticket not found');
        conds.push(eq(gasto.estado, 'CONFIRMADO'));
      }

      return tx.select().from(gasto).where(and(...conds)).orderBy(desc(gasto.createdAt));
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

  async totalConfirmado(
    tenantId: string,
    ticketId: string,
    viewer: GastoViewer,
  ): Promise<{ moneda: string; total: number }[]> {
    return withTenant(tenantId, async (tx) => {
      if (viewer.kind === 'RESIDENTE') {
        const t = (
          await tx
            .select()
            .from(ticket)
            .where(and(eq(ticket.tenantId, tenantId), eq(ticket.id, ticketId)))
            .limit(1)
        )[0];
        if (!t) throw new NotFoundException('ticket not found');
        const ctx = await loadResidenteCtx(tx, tenantId, viewer.residenteId);
        const puede = canResidenteSeeCosto(ctx, {
          tipo: t.tipo,
          origen: t.origen,
          unidadId: t.unidadId,
          consorcioId: t.consorcioId,
        });
        if (!puede) throw new NotFoundException('ticket not found');
      }

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
