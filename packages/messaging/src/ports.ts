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
  wamid: string;
  from: E164Phone;
  kind: 'text' | 'audio' | 'image' | 'other';
  text?: string;
  mediaId?: string;
  receivedAt: Date;
}

export interface IMessagingProvider {
  verifySignature(rawBody: string, signatureHeader: string | undefined): boolean;
  parseWebhook(payload: unknown): InboundMessage[];
  sendTemplate(msg: OutboundTemplateMessage): Promise<{ providerMessageId: string }>;
  sendText(msg: OutboundTextMessage): Promise<{ providerMessageId: string }>;
  downloadMedia(mediaId: string): Promise<{ contentType: string; bytes: ArrayBuffer }>;
}
