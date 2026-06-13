import { Body, Controller, ForbiddenException, Get, Post, Query, Req } from '@nestjs/common';
import { and, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import type { AuthedRequest } from '../auth/auth.guard.js';
import { Roles } from '../auth/roles.guard.js';
import { systemDb } from '../db/client.js';
import { withTenant } from '../db/client.js';
import { notificacion, residente } from '../db/schema/index.js';

const Q = z.object({
  ticket_id: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

const PushTokenDto = z.object({
  token: z.string().min(8).max(200),
});

function tid(req: AuthedRequest): string {
  const header = req.headers['x-tenant-id'];
  if (req.user?.kind === 'SUPER_ADMIN' && typeof header === 'string' && header) return header;
  const t = req.user?.tid;
  if (!t) throw new ForbiddenException('no tenant');
  return t;
}

@Controller()
export class NotificationsController {
  @Roles('SUPER_ADMIN', 'ADMIN')
  @Get('admin/notificaciones')
  async list(@Req() req: AuthedRequest, @Query() q: unknown) {
    const dto = Q.parse(q);
    const t = tid(req);
    return withTenant(t, async (tx) => {
      const conds = [eq(notificacion.tenantId, t)];
      if (dto.ticket_id) conds.push(eq(notificacion.ticketId, dto.ticket_id));
      return tx
        .select()
        .from(notificacion)
        .where(and(...conds))
        .orderBy(desc(notificacion.createdAt))
        .limit(dto.limit);
    });
  }

  // Mobile registra su Expo Push token. Persiste en residente (columna push_token).
  @Roles('RESIDENTE')
  @Post('me/push-token')
  async registerPushToken(@Req() req: AuthedRequest, @Body() body: unknown) {
    const dto = PushTokenDto.parse(body);
    const userId = req.user!.sub;
    await systemDb
      .update(residente)
      .set({ pushToken: dto.token, pushTokenUpdatedAt: new Date() })
      .where(eq(residente.id, userId));
    return { ok: true };
  }
}
