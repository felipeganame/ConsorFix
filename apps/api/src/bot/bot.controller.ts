import { Body, Controller, ForbiddenException, Headers, Post } from '@nestjs/common';
import { z } from 'zod';
import type { InboundMessage } from '@consorciofix/messaging';
import { Public } from '../auth/auth.guard.js';
import { BotService } from './bot.service.js';

const ProcessBody = z.object({
  wamid: z.string(),
  from: z.string(),
  kind: z.enum(['text', 'audio', 'image', 'other']),
  text: z.string().optional(),
  mediaId: z.string().optional(),
  receivedAt: z.string().datetime(),
});

/**
 * Internal endpoint called by the worker after dequeuing
 * `process-incoming-message`. Protected by a shared bearer token (not JWT)
 * — only the worker should know `INTERNAL_TOKEN`.
 */
@Public()
@Controller('internal/bot')
export class BotController {
  constructor(private readonly bot: BotService) {}

  @Post('process')
  async process(@Headers('x-internal-token') token: string | undefined, @Body() body: unknown) {
    const expected = process.env.INTERNAL_TOKEN ?? '';
    if (!expected || token !== expected) throw new ForbiddenException('internal endpoint');
    const dto = ProcessBody.parse(body);
    const inbound: InboundMessage = {
      wamid: dto.wamid,
      from: dto.from as `+${string}`,
      kind: dto.kind,
      ...(dto.text !== undefined && { text: dto.text }),
      ...(dto.mediaId !== undefined && { mediaId: dto.mediaId }),
      receivedAt: new Date(dto.receivedAt),
    };
    return this.bot.handle(inbound);
  }
}
