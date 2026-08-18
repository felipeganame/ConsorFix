import { Body, Controller, Get, Post, Query, Req } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { assertMismoTenant } from '../common/assert-mismo-tenant.js';
import type { AuthedRequest } from '../auth/auth.guard.js';
import { Roles } from '../auth/roles.guard.js';
import { withTenant } from '../db/client.js';
import { categoria, consorcio } from '../db/schema/index.js';
import { tenantIdFromReq } from './tenant-ctx.js';

const CreateBody = z.object({
  consorcio_id: z.string().uuid(),
  nombre: z.string().min(1).max(60),
  es_conducta: z.boolean().default(false),
});

const ListQuery = z.object({ consorcio_id: z.string().uuid().optional() });

@Roles('SUPER_ADMIN', 'ADMIN')
@Controller('categorias')
export class CategoriasController {
  @Get()
  async list(@Req() req: AuthedRequest, @Query() q: unknown) {
    const tid = tenantIdFromReq(req);
    const dto = ListQuery.parse(q);
    return withTenant(tid, async (tx) => {
      const conds = [eq(categoria.tenantId, tid)];
      if (dto.consorcio_id) conds.push(eq(categoria.consorcioId, dto.consorcio_id));
      return tx.select().from(categoria).where(and(...conds));
    });
  }

  @Post()
  async create(@Req() req: AuthedRequest, @Body() body: unknown) {
    const dto = CreateBody.parse(body);
    const tid = tenantIdFromReq(req);
    return withTenant(tid, async (tx) => {
      // El consorcio tiene que ser del tenant: RLS no valida el destino de la FK.
      if (dto.consorcio_id) {
        await assertMismoTenant(tx, tid, { columnaId: consorcio.id, columnaTenant: consorcio.tenantId, nombre: 'consorcio' }, dto.consorcio_id);
      }
      return (
        await tx
          .insert(categoria)
          .values({
            tenantId: tid,
            consorcioId: dto.consorcio_id,
            nombre: dto.nombre,
            esConducta: dto.es_conducta,
          })
          .returning()
      )[0];
    });
  }
}
