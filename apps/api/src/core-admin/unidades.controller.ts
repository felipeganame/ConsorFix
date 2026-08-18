import { Body, Controller, Get, Post, Query, Req } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import type { AuthedRequest } from '../auth/auth.guard.js';
import { Roles } from '../auth/roles.guard.js';
import { withTenant } from '../db/client.js';
import { assertMismoTenant } from '../common/assert-mismo-tenant.js';
import { consorcio, unidad } from '../db/schema/index.js';
import { tenantIdFromReq } from './tenant-ctx.js';

const CreateBody = z.object({
  consorcio_id: z.string().uuid(),
  etiqueta: z.string().min(1).max(40),
});

const BulkBody = z.object({
  consorcio_id: z.string().uuid(),
  etiquetas: z.array(z.string().min(1).max(40)).min(1).max(500),
});

const ListQuery = z.object({ consorcio_id: z.string().uuid().optional() });

@Roles('SUPER_ADMIN', 'ADMIN')
@Controller('unidades')
export class UnidadesController {
  @Get()
  async list(@Req() req: AuthedRequest, @Query() q: unknown) {
    const tid = tenantIdFromReq(req);
    const dto = ListQuery.parse(q);
    return withTenant(tid, async (tx) => {
      const conds = [eq(unidad.tenantId, tid)];
      if (dto.consorcio_id) conds.push(eq(unidad.consorcioId, dto.consorcio_id));
      return tx.select().from(unidad).where(and(...conds));
    });
  }

  @Post()
  async create(@Req() req: AuthedRequest, @Body() body: unknown) {
    const dto = CreateBody.parse(body);
    const tid = tenantIdFromReq(req);
    return withTenant(tid, async (tx) => {
      // El consorcio tiene que ser del tenant: RLS no valida el destino de la FK.
      await assertMismoTenant(tx, tid, consorcio as never, dto.consorcio_id, 'consorcio');
      return (
        await tx
          .insert(unidad)
          .values({ tenantId: tid, consorcioId: dto.consorcio_id, etiqueta: dto.etiqueta })
          .returning()
      )[0];
    });
  }

  @Post('bulk')
  async bulk(@Req() req: AuthedRequest, @Body() body: unknown) {
    const dto = BulkBody.parse(body);
    const tid = tenantIdFromReq(req);
    return withTenant(tid, async (tx) => {
      await assertMismoTenant(tx, tid, consorcio as never, dto.consorcio_id, 'consorcio');
      return tx
        .insert(unidad)
        .values(dto.etiquetas.map((e) => ({ tenantId: tid, consorcioId: dto.consorcio_id, etiqueta: e })))
        .onConflictDoNothing()
        .returning();
    });
  }
}
