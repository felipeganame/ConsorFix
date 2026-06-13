import { Controller, ForbiddenException, Get, Query, Req } from '@nestjs/common';
import { z } from 'zod';
import type { AuthedRequest } from '../auth/auth.guard.js';
import { Roles } from '../auth/roles.guard.js';
import { MetricsService } from './metrics.service.js';

const Q = z.object({ consorcio_id: z.string().uuid().optional() });

@Roles('SUPER_ADMIN', 'ADMIN')
@Controller('admin/metrics')
export class MetricsController {
  constructor(private readonly metrics: MetricsService) {}

  @Get()
  async overview(@Req() req: AuthedRequest, @Query() q: unknown) {
    const headerTid = req.headers['x-tenant-id'];
    let tid: string | undefined = req.user?.tid ?? undefined;
    if (req.user?.kind === 'SUPER_ADMIN' && typeof headerTid === 'string' && headerTid) tid = headerTid;
    if (!tid) throw new ForbiddenException('no tenant');
    const dto = Q.parse(q);
    return this.metrics.overview(tid, dto.consorcio_id);
  }
}
