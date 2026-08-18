import { Body, Controller, Get, Post, Query, Req } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { assertMismoTenant } from '../common/assert-mismo-tenant.js';
import type { AuthedRequest } from '../auth/auth.guard.js';
import { Roles } from '../auth/roles.guard.js';
import { withTenant } from '../db/client.js';
import { residente, unidad, vinculoResidente } from '../db/schema/index.js';
import { tenantIdFromReq } from './tenant-ctx.js';

const CreateBody = z.object({
  residente_id: z.string().uuid(),
  unidad_id: z.string().uuid(),
  rol: z.enum(['PROPIETARIO', 'INQUILINO']),
});

const ListQuery = z.object({
  unidad_id: z.string().uuid().optional(),
  residente_id: z.string().uuid().optional(),
});

@Roles('SUPER_ADMIN', 'ADMIN')
@Controller('vinculos')
export class VinculosController {
  @Get()
  async list(@Req() req: AuthedRequest, @Query() q: unknown) {
    const tid = tenantIdFromReq(req);
    const dto = ListQuery.parse(q);
    return withTenant(tid, async (tx) => {
      const conds = [eq(vinculoResidente.tenantId, tid)];
      if (dto.unidad_id) conds.push(eq(vinculoResidente.unidadId, dto.unidad_id));
      if (dto.residente_id) conds.push(eq(vinculoResidente.residenteId, dto.residente_id));
      return tx.select().from(vinculoResidente).where(and(...conds));
    });
  }

  @Post()
  async create(@Req() req: AuthedRequest, @Body() body: unknown) {
    const dto = CreateBody.parse(body);
    const tid = tenantIdFromReq(req);
    return withTenant(tid, async (tx) => {
      // Los DOS extremos tienen que ser del tenant. Sin esto se podía vincular
      // un residente ajeno a una unidad ajena, y el listado exponía los ids.
      await assertMismoTenant(tx, tid, residente as never, dto.residente_id, 'residente');
      await assertMismoTenant(tx, tid, unidad as never, dto.unidad_id, 'unidad');
      return (
        await tx
          .insert(vinculoResidente)
          .values({ tenantId: tid, residenteId: dto.residente_id, unidadId: dto.unidad_id, rol: dto.rol })
          .returning()
      )[0];
    });
  }
}
