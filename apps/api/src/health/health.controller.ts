import { Controller, Get } from '@nestjs/common';
import { Public } from '../auth/auth.guard.js';

@Controller('health')
export class HealthController {
  @Public()
  @Get()
  ok(): { status: 'ok'; ts: string } {
    return { status: 'ok', ts: new Date().toISOString() };
  }
}
