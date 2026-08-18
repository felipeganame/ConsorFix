import { Body, Controller, Delete, ForbiddenException, Get, Param, Post, Query, Req } from '@nestjs/common';
import { z } from 'zod';
import { Roles } from '../auth/roles.guard.js';
import type { AuthedRequest } from '../auth/auth.guard.js';
import { TicketsService, type TicketViewer } from './tickets.service.js';
import { VotosService } from './votos.service.js';

const CreateTicketBody = z.object({
  consorcio_id: z.string().uuid(),
  unidad_id: z.string().uuid().nullable().default(null),
  tipo: z.enum(['INFRAESTRUCTURA', 'CONDUCTA']),
  urgencia: z.enum(['CRITICA', 'ALTA', 'MEDIA', 'BAJA']).default('MEDIA'),
  origen_sugerido: z.enum(['UNIDAD', 'ESPACIO_COMUN']).optional(),
  titulo: z.string().min(3).max(140),
  descripcion: z.string().min(1).max(4000),
  client_generated_id: z.string().uuid().optional(),
});

const TransitionBody = z.object({
  to: z.enum(['REGISTRADO', 'VALIDADO', 'DESCARTADO', 'SOLUCIONADO']),
  nota: z.string().max(2000).optional(),
  origen: z.enum(['UNIDAD', 'ESPACIO_COMUN']).optional(),
  categoria_id: z.string().uuid().optional(),
  /** RF-F01: unidad del vecino señalado. Obligatorio al validar una CONDUCTA. */
  unidad_reportada_id: z.string().uuid().optional(),
});

const ListQuery = z.object({
  consorcio_id: z.string().uuid().optional(),
  estado: z.enum(['REGISTRADO', 'VALIDADO', 'DESCARTADO', 'SOLUCIONADO']).optional(),
});

function viewer(req: AuthedRequest): TicketViewer {
  const kind = req.user?.kind;
  if (kind === 'RESIDENTE') return { kind, residenteId: req.user!.sub };
  if (kind === 'ADMIN' || kind === 'SUPER_ADMIN') return { kind };
  throw new ForbiddenException('no user context');
}

function tid(req: AuthedRequest): string {
  const headerTid = req.headers['x-tenant-id'];
  const fromToken = req.user?.tid;
  if (req.user?.kind === 'SUPER_ADMIN' && typeof headerTid === 'string' && headerTid) return headerTid;
  if (!fromToken) throw new ForbiddenException('no tenant in token');
  return fromToken;
}

@Controller('tickets')
export class TicketsController {
  constructor(
    private readonly tickets: TicketsService,
    private readonly votos: VotosService,
  ) {}

  /**
   * Creación de ticket. La comparte el residente y el admin.
   *
   * El admin la necesita para el criterio de salida de la Fase 1 (docs/05):
   * "un admin puede cargar su consorcio y crear un ticket manual". Estaba
   * restringido a RESIDENTE, así que un admin recibía 403 y ese criterio no se
   * podía demostrar. Pasa cuando alguien reporta por teléfono o en persona.
   *
   * Diferencia importante: cuando lo crea un admin, `reportanteId` queda NULL
   * —no hay un residente que haya reportado— y por eso la validación de
   * pertenencia al consorcio no aplica: el admin es dueño de todo su tenant.
   */
  @Roles('SUPER_ADMIN', 'ADMIN', 'RESIDENTE')
  @Post()
  async create(@Req() req: AuthedRequest, @Body() body: unknown) {
    const dto = CreateTicketBody.parse(body);
    const esResidente = req.user?.kind === 'RESIDENTE';
    return this.tickets.create(tid(req), {
      consorcioId: dto.consorcio_id,
      unidadId: dto.unidad_id,
      reportanteId: esResidente ? req.user!.sub : null,
      ...(esResidente ? {} : { creadoPorAdminId: req.user!.sub }),
      tipo: dto.tipo,
      urgencia: dto.urgencia,
      titulo: dto.titulo,
      descripcionNormalizada: dto.descripcion,
      ...(dto.origen_sugerido !== undefined && { origenSugerido: dto.origen_sugerido }),
      ...(dto.client_generated_id !== undefined && { clientGeneratedId: dto.client_generated_id }),
    });
  }

  @Roles('SUPER_ADMIN', 'ADMIN')
  @Get()
  async list(@Req() req: AuthedRequest, @Query() q: unknown) {
    const dto = ListQuery.parse(q);
    return this.tickets.list(tid(req), {
      ...(dto.consorcio_id !== undefined && { consorcioId: dto.consorcio_id }),
      ...(dto.estado !== undefined && { estado: dto.estado }),
    });
  }

  /**
   * El rol se declara explícitamente porque RolesGuard deja pasar a cualquier
   * autenticado cuando el handler no tiene metadata. La visibilidad fina para
   * RESIDENTE la resuelve el service con la matriz de `packages/domain`.
   */
  @Roles('SUPER_ADMIN', 'ADMIN', 'RESIDENTE')
  @Get(':id')
  async one(@Req() req: AuthedRequest, @Param('id') id: string) {
    return this.tickets.byId(tid(req), id, viewer(req));
  }

  /** Historial auditable del ticket (RF-D02). */
  @Roles('SUPER_ADMIN', 'ADMIN', 'RESIDENTE')
  @Get(':id/historial')
  async historial(@Req() req: AuthedRequest, @Param('id') id: string) {
    return this.tickets.historial(tid(req), id, viewer(req));
  }

  @Roles('SUPER_ADMIN', 'ADMIN')
  @Post(':id/transitions')
  async transition(@Req() req: AuthedRequest, @Param('id') id: string, @Body() body: unknown) {
    const dto = TransitionBody.parse(body);
    return this.tickets.transition(tid(req), req.user!.sub, id, dto.to, {
      ...(dto.nota !== undefined && { nota: dto.nota }),
      ...(dto.origen !== undefined && { origen: dto.origen }),
      ...(dto.categoria_id !== undefined && { categoriaId: dto.categoria_id }),
      ...(dto.unidad_reportada_id !== undefined && { unidadReportadaId: dto.unidad_reportada_id }),
    });
  }

  @Roles('RESIDENTE')
  @Post(':id/votes')
  async vote(@Req() req: AuthedRequest, @Param('id') id: string) {
    return this.votos.vote(tid(req), req.user!.sub, id);
  }

  @Roles('RESIDENTE')
  @Delete(':id/votes')
  async unvote(@Req() req: AuthedRequest, @Param('id') id: string) {
    return this.votos.unvote(tid(req), req.user!.sub, id);
  }
}
