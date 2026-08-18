import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';
import { canResidenteSeeTicket } from '@consorciofix/domain';
import { ticket, voto } from '../db/schema/index.js';
import { withTenant } from '../db/client.js';
import { loadResidenteCtx } from '../common/residente-ctx.js';

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

      // Las conductas no se votan (RF-F02 / P5): son una denuncia entre
      // vecinos, no un reclamo colectivo que gane prioridad por apoyo. Sin
      // este chequeo el propio denunciado podía votar la denuncia hecha en su
      // contra —y de paso quedaba suscripto a sus notificaciones—.
      if (t.tipo === 'CONDUCTA') {
        throw new ForbiddenException('los tickets de conducta no se votan');
      }

      const ctx = await loadResidenteCtx(tx, tenantId, residenteId);
      const can = canResidenteSeeTicket(ctx, {
        tipo: t.tipo,
        origen: t.origen,
        unidadId: t.unidadId,
        unidadReportadaId: t.unidadReportadaId,
        reportanteId: t.reportanteId,
        consorcioId: t.consorcioId,
      });
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
