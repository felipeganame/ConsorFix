import { Controller, ForbiddenException, Get, Req } from '@nestjs/common';
import type { AuthedRequest } from '../auth/auth.guard.js';
import { Roles } from '../auth/roles.guard.js';
import { MeService } from './me.service.js';

@Roles('RESIDENTE')
@Controller('me')
export class MeController {
  constructor(private readonly me: MeService) {}

  @Get('tickets')
  async myTickets(@Req() req: AuthedRequest) {
    const tid = req.user?.tid;
    if (!tid) throw new ForbiddenException('no tenant in token');
    return this.me.listFeed(tid, req.user!.sub);
  }
}
