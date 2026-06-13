import { Body, Controller, ForbiddenException, Get, Param, Post, Req } from '@nestjs/common';
import { z } from 'zod';
import type { AuthedRequest } from '../auth/auth.guard.js';
import { Roles } from '../auth/roles.guard.js';
import { GastosService } from './gastos.service.js';

const CreateGastoBody = z.object({
  descripcion: z.string().min(1).max(280),
  monto: z.number().positive(),
  moneda: z.string().length(3).default('ARS'),
  comprobante_url: z.string().url().optional(),
  estado: z.enum(['BORRADOR', 'CONFIRMADO']).default('CONFIRMADO'),
});

function tid(req: AuthedRequest): string {
  const headerTid = req.headers['x-tenant-id'];
  if (req.user?.kind === 'SUPER_ADMIN' && typeof headerTid === 'string' && headerTid) return headerTid;
  const tid = req.user?.tid;
  if (!tid) throw new ForbiddenException('no tenant in token');
  return tid;
}

/**
 * Costos del arreglo (RF-D05). El admin carga monto + factura cuando se
 * resuelve un ticket. Soporta múltiples gastos por ticket (plomero + materiales).
 */
@Controller('tickets/:ticketId/gastos')
export class GastosController {
  constructor(private readonly gastos: GastosService) {}

  @Get()
  async list(@Req() req: AuthedRequest, @Param('ticketId') ticketId: string) {
    return this.gastos.list(tid(req), ticketId);
  }

  @Get('total')
  async total(@Req() req: AuthedRequest, @Param('ticketId') ticketId: string) {
    return this.gastos.totalConfirmado(tid(req), ticketId);
  }

  @Roles('SUPER_ADMIN', 'ADMIN')
  @Post()
  async create(
    @Req() req: AuthedRequest,
    @Param('ticketId') ticketId: string,
    @Body() body: unknown,
  ) {
    const dto = CreateGastoBody.parse(body);
    return this.gastos.create(tid(req), req.user!.sub, ticketId, {
      descripcion: dto.descripcion,
      monto: dto.monto,
      moneda: dto.moneda,
      estado: dto.estado,
      ...(dto.comprobante_url !== undefined && { comprobanteUrl: dto.comprobante_url }),
    });
  }
}
