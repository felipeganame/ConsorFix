import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import { and, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import type { AuthedRequest } from '../auth/auth.guard.js';
import { Roles } from '../auth/roles.guard.js';
import { AuditService } from '../audit/audit.service.js';
import { withTenant } from '../db/client.js';
import { registroConducta, ticket } from '../db/schema/index.js';

const CreateBody = z.object({
  resultado: z.enum(['DESCARTADO', 'AVISO', 'SANCION']),
  detalle: z.string().max(2000).optional(),
});

function tid(req: AuthedRequest): string {
  const headerTid = req.headers['x-tenant-id'];
  if (req.user?.kind === 'SUPER_ADMIN' && typeof headerTid === 'string' && headerTid) return headerTid;
  const t = req.user?.tid;
  if (!t) throw new ForbiddenException('no tenant');
  return t;
}

@Roles('SUPER_ADMIN', 'ADMIN')
@Controller('tickets/:ticketId/registros-conducta')
export class ConductaController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  async list(@Req() req: AuthedRequest, @Param('ticketId') ticketId: string) {
    const t = tid(req);
    return withTenant(t, async (tx) =>
      tx
        .select()
        .from(registroConducta)
        .where(and(eq(registroConducta.tenantId, t), eq(registroConducta.ticketId, ticketId)))
        .orderBy(desc(registroConducta.createdAt)),
    );
  }

  @Post()
  async create(
    @Req() req: AuthedRequest,
    @Param('ticketId') ticketId: string,
    @Body() body: unknown,
  ) {
    const dto = CreateBody.parse(body);
    const t = tid(req);
    const created = await withTenant(t, async (tx) => {
      const tk = (await tx
        .select({
          id: ticket.id,
          unidadId: ticket.unidadId,
          unidadReportadaId: ticket.unidadReportadaId,
          tipo: ticket.tipo,
          estado: ticket.estado,
        })
        .from(ticket)
        .where(and(eq(ticket.tenantId, t), eq(ticket.id, ticketId)))
        .limit(1))[0];
      if (!tk) throw new NotFoundException('ticket not found');
      if (tk.tipo !== 'CONDUCTA') {
        throw new ForbiddenException('registro_conducta solo aplica a tickets tipo CONDUCTA');
      }
      // La sanción va contra la unidad ACUSADA, que desde la migración 0004 vive
      // en su propia columna. Acá se leía `unidad_id`, que en un ticket creado
      // por el bot es la unidad del DENUNCIANTE —el bot imputa la unidad de quien
      // escribe—, así que un aviso o una sanción quedaban registrados contra el
      // vecino que hizo la denuncia y le ensuciaban su propio historial de
      // convivencia (RF-F03). La 0004 hizo el backfill de los tickets viejos, así
      // que exigir la columna nueva no deja ninguno afuera.
      if (!tk.unidadReportadaId) {
        throw new ForbiddenException(
          'el ticket todavía no tiene unidad señalada: validalo indicando a qué unidad corresponde',
        );
      }
      return (await tx
        .insert(registroConducta)
        .values({
          tenantId: t,
          unidadId: tk.unidadReportadaId,
          ticketId,
          resultado: dto.resultado,
          detalle: dto.detalle ?? null,
        })
        .returning())[0]!;
    });
    void this.audit.record({
      tenantId: t,
      actorId: req.user!.sub,
      actorTipo: 'ADMIN',
      accion: `conducta.${dto.resultado.toLowerCase()}`,
      entidad: 'registro_conducta',
      entidadId: created.id,
      detalle: { ticketId, ...(dto.detalle && { detalle: dto.detalle }) },
    });
    return created;
  }
}

/**
 * Historial de convivencia por unidad (RF-F03): todos los avisos/sanciones
 * registrados contra una unidad, a través de cualquier ticket de conducta.
 * Solo el admin lo consulta (P5). Incluye contexto del ticket para lectura.
 */
@Roles('SUPER_ADMIN', 'ADMIN')
@Controller('unidades/:unidadId/historial-conducta')
export class HistorialConductaController {
  @Get()
  async list(@Req() req: AuthedRequest, @Param('unidadId') unidadId: string) {
    const t = tid(req);
    return withTenant(t, async (tx) =>
      tx
        .select({
          id: registroConducta.id,
          ticketId: registroConducta.ticketId,
          resultado: registroConducta.resultado,
          detalle: registroConducta.detalle,
          createdAt: registroConducta.createdAt,
          ticketTitulo: ticket.titulo,
          ticketEstado: ticket.estado,
        })
        .from(registroConducta)
        .innerJoin(ticket, eq(ticket.id, registroConducta.ticketId))
        .where(and(eq(registroConducta.tenantId, t), eq(registroConducta.unidadId, unidadId)))
        .orderBy(desc(registroConducta.createdAt)),
    );
  }
}
