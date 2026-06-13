import { Body, Controller, Get, NotFoundException, Param, Patch, Post, Req } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import type { AuthedRequest } from '../auth/auth.guard.js';
import { Roles } from '../auth/roles.guard.js';
import { withTenant } from '../db/client.js';
import { consorcio } from '../db/schema/index.js';
import { tenantIdFromReq } from './tenant-ctx.js';

const CreateBody = z.object({
  nombre: z.string().min(1).max(140),
  tipo: z.enum(['EDIFICIO', 'BARRIO', 'OFICINAS']),
  direccion: z.string().max(280).optional(),
});

const UpdateBody = z.object({
  nombre: z.string().min(1).max(140).optional(),
  direccion: z.string().max(280).optional(),
  archivado: z.boolean().optional(),
});

@Roles('SUPER_ADMIN', 'ADMIN')
@Controller('consorcios')
export class ConsorciosController {
  @Get()
  async list(@Req() req: AuthedRequest) {
    const tid = tenantIdFromReq(req);
    return withTenant(tid, async (tx) => tx.select().from(consorcio).where(eq(consorcio.tenantId, tid)));
  }

  @Post()
  async create(@Req() req: AuthedRequest, @Body() body: unknown) {
    const dto = CreateBody.parse(body);
    const tid = tenantIdFromReq(req);
    return withTenant(tid, async (tx) =>
      (await tx
        .insert(consorcio)
        .values({ tenantId: tid, nombre: dto.nombre, tipo: dto.tipo, direccion: dto.direccion ?? null })
        .returning())[0],
    );
  }

  @Get(':id')
  async one(@Req() req: AuthedRequest, @Param('id') id: string) {
    const tid = tenantIdFromReq(req);
    const row = await withTenant(tid, async (tx) =>
      tx.select().from(consorcio).where(and(eq(consorcio.tenantId, tid), eq(consorcio.id, id))).limit(1),
    );
    if (!row[0]) throw new NotFoundException();
    return row[0];
  }

  @Patch(':id')
  async update(@Req() req: AuthedRequest, @Param('id') id: string, @Body() body: unknown) {
    const dto = UpdateBody.parse(body);
    const tid = tenantIdFromReq(req);
    return withTenant(tid, async (tx) =>
      (await tx
        .update(consorcio)
        .set({
          ...(dto.nombre !== undefined && { nombre: dto.nombre }),
          ...(dto.direccion !== undefined && { direccion: dto.direccion }),
          ...(dto.archivado !== undefined && { archivado: dto.archivado }),
        })
        .where(and(eq(consorcio.tenantId, tid), eq(consorcio.id, id)))
        .returning())[0],
    );
  }
}
