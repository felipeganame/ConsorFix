import { timingSafeEqual } from 'node:crypto';
import type { E164Phone } from '@consorciofix/contracts';
import type {
  IMessagingProvider,
  InboundMessage,
  OutboundTemplateMessage,
  OutboundTextMessage,
} from '../ports.js';

/**
 * Adaptador de Telegram Bot API.
 *
 * Se agrega **al lado** de WhatsApp, no en lugar de. Los documentos de la
 * tesis especifican WhatsApp (RF-B01..B10, proceso P1), así que reemplazarlo
 * dejaría los requerimientos contradiciendo el código. Tener los dos detrás
 * del mismo puerto es además la demostración de que la abstracción sirve.
 *
 * Por qué conviene para desarrollar: crear un bot es hablar con @BotFather y
 * listo. No hay verificación de Meta Business, ni número productivo, ni
 * plantillas HSM que aprobar, ni ventana de 24 horas.
 *
 * Tres diferencias con WhatsApp que se resuelven acá:
 *
 * 1. **Identidad.** Telegram identifica por `chat_id` numérico, no por
 *    teléfono. El puente es el botón nativo de compartir contacto: el teléfono
 *    lo verifica Telegram, no lo escribe el usuario, así que nadie puede
 *    reclamar el chat de otro. Ver migración 0005.
 * 2. **Autenticidad del webhook.** No hay HMAC sobre el cuerpo: Telegram manda
 *    un token fijo en el header `X-Telegram-Bot-Api-Secret-Token`, definido al
 *    registrar el webhook. Se compara en tiempo constante igual que la firma
 *    de Meta.
 * 3. **Media.** Es en dos pasos: `getFile` devuelve una ruta y recién después
 *    se descarga el archivo.
 */
const TELEGRAM_API = 'https://api.telegram.org';

interface TelegramUpdate {
  update_id?: number;
  message?: {
    message_id?: number;
    date?: number;
    chat?: { id?: number };
    from?: { id?: number };
    text?: string;
    caption?: string;
    contact?: { phone_number?: string; user_id?: number };
    voice?: { file_id?: string };
    audio?: { file_id?: string };
    photo?: Array<{ file_id?: string; file_size?: number }>;
    document?: { file_id?: string; mime_type?: string };
  };
}

function normalizarE164(raw: string): string {
  const limpio = raw.replace(/[^\d+]/g, '');
  return limpio.startsWith('+') ? limpio : `+${limpio}`;
}

export class TelegramProvider implements IMessagingProvider {
  constructor(
    private readonly botToken: string = process.env.TELEGRAM_BOT_TOKEN ?? '',
    private readonly secretToken: string = process.env.TELEGRAM_WEBHOOK_SECRET ?? '',
  ) {
    if (!botToken) throw new Error('TELEGRAM_BOT_TOKEN requerido para TelegramProvider');
  }

  private api(method: string): string {
    return `${TELEGRAM_API}/bot${this.botToken}/${method}`;
  }

  /**
   * Telegram no firma el cuerpo: manda un token fijo en el header. Se compara
   * en tiempo constante igual que el HMAC de Meta, y **fail-closed**: sin
   * secreto configurado se rechaza, en vez de aceptar cualquier payload.
   */
  verifySignature(_rawBody: string, signatureHeader: string | undefined): boolean {
    if (!this.secretToken) return false;
    if (!signatureHeader) return false;
    const a = Buffer.from(signatureHeader);
    const b = Buffer.from(this.secretToken);
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  }

  parseWebhook(payload: unknown): InboundMessage[] {
    const update = payload as TelegramUpdate;
    const m = update?.message;
    if (!m) return [];

    const chatId = m.chat?.id ?? m.from?.id;
    if (chatId === undefined) return [];

    const recibido = m.date ? new Date(m.date * 1000) : new Date();
    // El id del mensaje es único por chat, no globalmente: se compone con el
    // chat para que la constraint de idempotencia (provider, wamid) sirva.
    const messageId = `tg:${chatId}:${m.message_id ?? 'sin-id'}`;

    const base = {
      wamid: messageId,
      // El teléfono todavía no se conoce; lo resuelve el bot por chat_id.
      // Se usa el chat como clave de ruteo hasta que haya vínculo.
      from: String(chatId) as E164Phone,
      channel: 'telegram' as const,
      externalId: String(chatId),
      receivedAt: recibido,
    };

    // Compartió el contacto: es el mensaje que habilita el vínculo.
    if (m.contact?.phone_number) {
      return [
        {
          ...base,
          kind: 'text',
          text: m.text ?? '',
          contactPhone: normalizarE164(m.contact.phone_number),
        },
      ];
    }

    if (m.voice?.file_id || m.audio?.file_id) {
      return [{ ...base, kind: 'audio', mediaId: (m.voice?.file_id ?? m.audio?.file_id)! }];
    }

    if (m.photo && m.photo.length > 0) {
      // Telegram manda varias resoluciones; la última es la mayor y es la que
      // le sirve al modelo de visión.
      const mayor = m.photo[m.photo.length - 1];
      if (mayor?.file_id) {
        const conTexto = m.caption ?? m.text;
        return [
          {
            ...base,
            kind: 'image',
            mediaId: mayor.file_id,
            ...(conTexto ? { text: conTexto } : {}),
          },
        ];
      }
    }

    if (typeof m.text === 'string' && m.text.length > 0) {
      return [{ ...base, kind: 'text', text: m.text }];
    }

    return [{ ...base, kind: 'other' }];
  }

  async sendText(msg: OutboundTextMessage): Promise<{ providerMessageId: string }> {
    const res = await fetch(this.api('sendMessage'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: msg.to, text: msg.text }),
    });
    if (!res.ok) throw new Error(`telegram sendMessage falló: ${res.status} ${await res.text()}`);
    const json = (await res.json()) as { result?: { message_id?: number } };
    return { providerMessageId: String(json.result?.message_id ?? '') };
  }

  /**
   * Telegram no tiene plantillas aprobadas ni ventana de 24 horas: se puede
   * escribir cuando se quiera. La plantilla se interpola acá y se manda como
   * texto, para que el resto del sistema no tenga que saber en qué canal está.
   */
  async sendTemplate(msg: OutboundTemplateMessage): Promise<{ providerMessageId: string }> {
    const cuerpo = Object.entries(msg.variables).reduce(
      (acc, [k, v]) => acc.replaceAll(`{{${k}}}`, v),
      msg.template,
    );
    return this.sendText({ to: msg.to, text: cuerpo });
  }

  /** Pide el teléfono con el botón nativo. Es el primer paso del vínculo. */
  async requestContact(chatId: string, texto: string): Promise<void> {
    await fetch(this.api('sendMessage'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: texto,
        reply_markup: {
          keyboard: [[{ text: '📱 Compartir mi número', request_contact: true }]],
          one_time_keyboard: true,
          resize_keyboard: true,
        },
      }),
    });
  }

  async downloadMedia(mediaId: string): Promise<{ contentType: string; bytes: ArrayBuffer }> {
    const meta = await fetch(this.api('getFile'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ file_id: mediaId }),
    });
    if (!meta.ok) throw new Error(`telegram getFile falló: ${meta.status}`);
    const json = (await meta.json()) as { result?: { file_path?: string } };
    const ruta = json.result?.file_path;
    if (!ruta) throw new Error('telegram getFile sin file_path');

    const bin = await fetch(`${TELEGRAM_API}/file/bot${this.botToken}/${ruta}`);
    if (!bin.ok) throw new Error(`telegram descarga falló: ${bin.status}`);
    return {
      contentType: bin.headers.get('content-type') ?? 'application/octet-stream',
      bytes: await bin.arrayBuffer(),
    };
  }
}
