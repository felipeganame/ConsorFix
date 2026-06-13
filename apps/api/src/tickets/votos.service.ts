import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { canResidenteSeeTicket } from '@consorciofix/domain';
import { ticket, unidad, vinculoResidente, voto } from '../db/schema/index.js';
import { withTenant } from '../db/client.js';

@Injectable()
export class VotosService {
  async vote(tenantId: string, residenteId: string, ticketId: string) {
    return withTenant(tenantId, async (tx) => {
      const t = (
        await tx
          .select()
          .from(ticket)
          .where(and(eq(ticket.tenantId, tenantId), eq(ticket.id, ticketId)))
          .limit(1)
      )[0];
      if (!t) throw new NotFoundException('ticket not found');

      // Vínculos activos del residente.
      const vinculos = await tx
        .select()
        .from(vinculoResidente)
        .where(
          and(
            eq(vinculoResidente.tenantId, tenantId),
            eq(vinculoResidente.residenteId, residenteId),
            eq(vinculoResidente.activo, true),
          ),
        );
      const unidadIds = new Set(vinculos.map((v) => v.unidadId));

      // Consorcios donde el residente tiene vínculo (vía sus unidades).
      let consorcioIds = new Set<string>();
      if (unidadIds.size > 0) {
        const unidades = await tx
          .select({ consorcioId: unidad.consorcioId })
          .from(unidad)
          .where(inArray(unidad.id, Array.from(unidadIds)));
        consorcioIds = new Set(unidades.map((u) => u.consorcioId));
      }

      const can = canResidenteSeeTicket(
        { residenteId, consorcioIds, unidadIds },
        { tipo: t.tipo, origen: t.origen, unidadId: t.unidadId, consorcioId: t.consorcioId },
      );
      if (!can) throw new ForbiddenException('ticket no visible para votar');

      // Idempotente vía UNIQUE(ticket_id, residente_id).
      await tx
        .insert(voto)
        .values({ tenantId, ticketId, residenteId })
        .onConflictDoNothing({ target: [voto.ticketId, voto.residenteId] });

      const refreshed = (
        await tx.select({ votosCount: ticket.votosCount }).from(ticket).where(eq(ticket.id, ticketId)).limit(1)
      )[0]!;
      return { ticketId, votosCount: refreshed.votosCount };
    });
  }

  async unvote(tenantId: string, residenteId: string, ticketId: string) {
    return withTenant(tenantId, async (tx) => {
      await tx
        .delete(voto)
        .where(
          and(
            eq(voto.tenantId, tenantId),
            eq(voto.ticketId, ticketId),
            eq(voto.residenteId, residenteId),
          ),
        );
      const t = (
        await tx.select({ votosCount: ticket.votosCount }).from(ticket).where(eq(ticket.id, ticketId)).limit(1)
      )[0];
      return { ticketId, votosCount: t?.votosCount ?? 0 };
    });
  }
}

void sql;
