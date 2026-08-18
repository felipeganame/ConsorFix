import {
  BadRequestException,
  Controller,
  Headers,
  Logger,
  Post,
  Req,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { TelegramProvider, telegramHabilitado } from '@consorciofix/messaging';
import { Public } from '../auth/auth.guard.js';
import { BotService } from '../bot/bot.service.js';
import { systemDb } from '../db/client.js';
import { webhookEvent } from '../db/schema/index.js';
import { QueueService } from '../queue/queue.service.js';

interface RawRequest extends Request {
  rawBody?: Buffer;
}

/**
 * Recepción de mensajes de Telegram. Mismo contrato que el webhook de
 * WhatsApp: verificar autenticidad, persistir el evento de forma idempotente,
 * encolar y responder 200 sin procesar inline (RNF-03, regla 3).
 *
 * Telegram no firma el cuerpo: manda un token fijo en un header, definido al
 * registrar el webhook con `setWebhook`. La comparación es en tiempo constante
 * y **fail-closed**, igual que la de Meta.
 */
@Public()
@Controller('webhooks/telegram')
export class TelegramWebhookController {
  private readonly log = new Logger(TelegramWebhookController.name);
  private readonly fallback = process.env.QUEUE_DISABLED === '1';

  constructor(
    private readonly bot: BotService,
    private readonly queue: QueueService,
  ) {}

  @Post()
  async receive(
    @Req() req: RawRequest,
    @Headers('x-telegram-bot-api-secret-token') secretHeader: string | undefined,
  ) {
    if (!telegramHabilitado()) {
      // Sin token de bot o sin secreto no se puede validar nada: se rechaza en
      // vez de aceptar payloads anónimos.
      throw new ServiceUnavailableException('canal telegram no configurado');
    }

    const raw = req.rawBody;
    if (!raw || raw.length === 0) throw new BadRequestException('missing body');

    const provider = new TelegramProvider();
    if (!provider.verifySignature(raw.toString('utf8'), secretHeader)) {
      throw new UnauthorizedException('secret token inválido');
    }

    const inbound = provider.parseWebhook(req.body);
    if (inbound.length === 0) return { status: 'ok', kind: 'non-message' };

    // Solo se encola lo que se insertó: una reentrega de Telegram no vuelve a
    // procesarse (misma lógica que el webhook de WhatsApp).
    const nuevos: typeof inbound = [];
    for (const m of inbound) {
      const ins = await systemDb
        .insert(webhookEvent)
        .values({
          provider: 'telegram',
          wamid: m.wamid,
          fromPhone: m.from,
          payload: m,
          estado: 'RECIBIDO',
        })
        .onConflictDoNothing({ target: [webhookEvent.provider, webhookEvent.wamid] })
        .returning({ wamid: webhookEvent.wamid });
      if (ins.length > 0) nuevos.push(m);
      else this.log.log({ wamid: m.wamid }, 'reentrega ignorada (update ya recibido)');
    }

    for (const m of nuevos) {
      if (this.fallback) {
        setImmediate(() => {
          this.bot.handle(m).catch((err) => {
            this.log.error({ err: (err as Error).message, wamid: m.wamid }, 'bot handler falló');
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
            ...(m.channel !== undefined && { channel: m.channel }),
            ...(m.externalId !== undefined && { externalId: m.externalId }),
            ...(m.contactPhone !== undefined && { contactPhone: m.contactPhone }),
            receivedAt: m.receivedAt.toISOString(),
          });
        } catch (err) {
          this.log.warn({ err: (err as Error).message, wamid: m.wamid }, 'encolado falló; inline');
          setImmediate(() => {
            this.bot.handle(m).catch((e) => {
              this.log.error({ err: (e as Error).message, wamid: m.wamid }, 'bot handler falló');
            });
          });
        }
      }
    }

    return { status: 'ok', received: inbound.length, procesados: nuevos.length };
  }
}
