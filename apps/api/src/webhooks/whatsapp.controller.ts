import {
  BadRequestException,
  Controller,
  Get,
  Headers,
  Logger,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { createWhatsAppProvider, verifyMetaSignature } from '@consorciofix/messaging';
import { Public } from '../auth/auth.guard.js';
import { BotService } from '../bot/bot.service.js';
import { systemDb } from '../db/client.js';
import { webhookEvent } from '../db/schema/index.js';
import { QueueService } from '../queue/queue.service.js';

interface RawRequest extends Request {
  rawBody?: Buffer;
}

@Public()
@Controller('webhooks/whatsapp')
export class WhatsAppWebhookController {
  private readonly log = new Logger(WhatsAppWebhookController.name);
  private readonly provider = createWhatsAppProvider();
  private readonly fallback = process.env.QUEUE_DISABLED === '1';

  constructor(
    private readonly bot: BotService,
    private readonly queue: QueueService,
  ) {}

  @Get()
  verify(@Req() req: RawRequest): string {
    const q = req.query as Record<string, string | undefined>;
    const mode = q['hub.mode'];
    const token = q['hub.verify_token'];
    const challenge = q['hub.challenge'];
    const expected = process.env.WHATSAPP_VERIFY_TOKEN ?? 'verify-me';
    if (mode === 'subscribe' && token === expected && challenge) return challenge;
    throw new UnauthorizedException('verify token mismatch');
  }

  /**
   * Recepción de mensajes (RF-B01).
   *   1. Verificar firma HMAC contra el rawBody.
   *   2. Persistir webhook_event con UNIQUE(provider, wamid) → idempotente.
   *   3. Encolar a BullMQ `process-incoming-message` (Phase 2.3, durable + retry).
   *      Fallback a `setImmediate` cuando QUEUE_DISABLED=1.
   *   4. Responder 200 inmediatamente (RNF-03).
   */
  @Post()
  async receive(
    @Req() req: RawRequest,
    @Headers('x-hub-signature-256') signature: string | undefined,
  ) {
    const secret = process.env.WHATSAPP_APP_SECRET ?? '';
    const raw = req.rawBody;
    if (!raw || raw.length === 0) throw new BadRequestException('missing body');

    // Fail-closed. Antes la verificación se salteaba cuando el secreto estaba
    // vacío (`if (secret && !verify)`), así que un deploy sin la variable
    // aceptaba cualquier payload en silencio: cualquiera podía crear tickets
    // a nombre de residentes reales. Ahora la falta de secreto es un error.
    if (!secret) {
      this.log.error('WHATSAPP_APP_SECRET no configurado: se rechaza el webhook');
      throw new UnauthorizedException('webhook signature not configured');
    }
    if (!verifyMetaSignature(raw, signature, secret)) {
      throw new UnauthorizedException('invalid signature');
    }

    const inbound = this.provider.parseWebhook(req.body);
    if (inbound.length === 0) return { status: 'ok', kind: 'non-message' };

    // Idempotencia real (regla 3). El UNIQUE(provider, wamid) ya evitaba la
    // fila duplicada, pero el encolado corría igual: una reentrega de Meta
    // —que ocurre ante cualquier timeout o 5xx— se procesaba de nuevo y
    // corrompía la sesión del bot, interpretándose como respuesta del usuario.
    // Ahora solo seguimos con los mensajes que realmente insertamos.
    const nuevos: typeof inbound = [];
    for (const m of inbound) {
      const ins = await systemDb
        .insert(webhookEvent)
        .values({
          provider: 'whatsapp',
          wamid: m.wamid,
          fromPhone: m.from,
          payload: m,
          estado: 'RECIBIDO',
        })
        .onConflictDoNothing({ target: [webhookEvent.provider, webhookEvent.wamid] })
        .returning({ wamid: webhookEvent.wamid });
      if (ins.length > 0) nuevos.push(m);
      else this.log.log({ wamid: m.wamid }, 'reentrega ignorada (wamid ya recibido)');
    }

    for (const m of nuevos) {
      if (this.fallback) {
        setImmediate(() => {
          this.bot.handle(m).catch((err) => {
            this.log.error({ err: (err as Error).message, wamid: m.wamid }, 'bot handler failed');
          });
        });
      } else {
        try {
          await this.queue.enqueueIncoming({
            wamid: m.wamid,
            from: m.from,
            kind: m.kind,
            ...(m.text !== undefined && { text: m.text }),
            ...(m.mediaId !== undefined && { mediaId: m.mediaId }),
            receivedAt: m.receivedAt.toISOString(),
          });
        } catch (err) {
          // Si encolar falla, no perdemos el mensaje: corremos in-process.
          this.log.warn({ err: (err as Error).message, wamid: m.wamid }, 'queue enqueue failed; falling back inline');
          setImmediate(() => {
            this.bot.handle(m).catch((e) => {
              this.log.error({ err: (e as Error).message, wamid: m.wamid }, 'bot handler failed');
            });
          });
        }
      }
    }

    return { status: 'ok', received: inbound.length, procesados: nuevos.length };
  }
}
