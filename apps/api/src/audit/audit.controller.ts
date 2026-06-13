import { Controller, ForbiddenException, Get, Query, Req } from '@nestjs/common';
import { and, desc, eq, gte, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { AuthedRequest } from '../auth/auth.guard.js';
import { Roles } from '../auth/roles.guard.js';
import { withTenant } from '../db/client.js';
import { auditLog } from '../db/schema/index.js';

const Q = z.object({
  entidad: z.string().max(60).optional(),
  accion: z.string().max(60).optional(),
  days: z.coerce.number().int().min(1).max(365).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
});

function tid(req: AuthedRequest): string {
  const header = req.headers['x-tenant-id'];
  if (req.user?.kind === 'SUPER_ADMIN' && typeof header === 'string' && header) return header;
  const t = req.user?.tid;
  if (!t) throw new ForbiddenException('no tenant');
  return t;
}

@Roles('SUPER_ADMIN', 'ADMIN')
@Controller('admin/audit-log')
export class AuditController {
  @Get()
  async list(@Req() req: AuthedRequest, @Query() q: unknown) {
    const dto = Q.parse(q);
    const t = tid(req);
    return withTenant(t, async (tx) => {
      const conds = [eq(auditLog.tenantId, t)];
      if (dto.entidad) conds.push(eq(auditLog.entidad, dto.entidad));
      if (dto.accion) conds.push(eq(auditLog.accion, dto.accion));
      if (dto.days) {
        const cutoff = new Date(Date.now() - dto.days * 86_400_000);
        conds.push(gte(auditLog.at, cutoff));
      }
      return tx
        .select()
        .from(auditLog)
        .where(and(...conds))
        .orderBy(desc(auditLog.at))
        .limit(dto.limit);
    });
  }
}

void sql;
