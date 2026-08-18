import type { E164Phone } from '@consorciofix/contracts';

export interface OutboundTemplateMessage {
  to: E164Phone;
  template: string;
  variables: Record<string, string>;
}

export interface OutboundTextMessage {
  to: E164Phone;
  text: string;
}

export interface InboundMessage {
  /** Id del mensaje en el proveedor. Clave de idempotencia (regla 3). */
  wamid: string;
  /**
   * Clave de ruteo. En WhatsApp es el teléfono; en Telegram, el chat_id
   * mientras no haya vínculo (ver `channel` / `externalId`).
   */
  from: E164Phone;
  kind: 'text' | 'audio' | 'image' | 'other';
  text?: string;
  mediaId?: string;
  receivedAt: Date;
  /** Canal de origen. Ausente = whatsapp, por compatibilidad. */
  channel?: 'whatsapp' | 'telegram';
  /** Identificador del proveedor cuando no es un teléfono (chat_id). */
  externalId?: string;
  /**
   * Teléfono verificado por la plataforma cuando el usuario comparte su
   * contacto. Es lo que habilita vincular un chat de Telegram con un residente.
   */
  contactPhone?: string;
}

export interface IMessagingProvider {
  verifySignature(rawBody: string, signatureHeader: string | undefined): boolean;
  parseWebhook(payload: unknown): InboundMessage[];
  sendTemplate(msg: OutboundTemplateMessage): Promise<{ providerMessageId: string }>;
  sendText(msg: OutboundTextMessage): Promise<{ providerMessageId: string }>;
  downloadMedia(mediaId: string): Promise<{ contentType: string; bytes: ArrayBuffer }>;
}
