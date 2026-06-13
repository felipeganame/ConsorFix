import type { E164Phone } from '@consorciofix/contracts';
import type {
  IMessagingProvider,
  InboundMessage,
  OutboundTemplateMessage,
  OutboundTextMessage,
} from '../ports.js';
import { verifyMetaSignature } from './signature.js';

/**
 * Production-ready WhatsApp Cloud API adapter.
 * Requires env: WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_ACCESS_TOKEN, WHATSAPP_APP_SECRET.
 * Shares parseWebhook with the mock adapter conceptually but ships its own copy
 * to keep the interface boundary clean.
 */
export class WhatsAppCloudProvider implements IMessagingProvider {
  private readonly baseUrl = 'https://graph.facebook.com/v18.0';

  constructor(
    private readonly phoneId: string,
    private readonly accessToken: string,
    private readonly appSecret: string,
  ) {
    if (!phoneId) throw new Error('WHATSAPP_PHONE_NUMBER_ID required');
    if (!accessToken) throw new Error('WHATSAPP_ACCESS_TOKEN required');
    if (!appSecret) throw new Error('WHATSAPP_APP_SECRET required');
  }

  verifySignature(rawBody: string, signatureHeader: string | undefined): boolean {
    return verifyMetaSignature(rawBody, signatureHeader, this.appSecret);
  }

  parseWebhook(payload: unknown): InboundMessage[] {
    const out: InboundMessage[] = [];
    const root = payload as MetaWebhookPayload;
    for (const entry of root.entry ?? []) {
      for (const change of entry.changes ?? []) {
        for (const m of change.value?.messages ?? []) {
          const phone = m.from as E164Phone;
          let kind: InboundMessage['kind'] = 'other';
          if (m.type === 'text') kind = 'text';
          else if (m.type === 'audio' || m.type === 'voice') kind = 'audio';
          else if (m.type === 'image') kind = 'image';
          const mediaId = m.image?.id ?? m.audio?.id;
          out.push({
            wamid: m.id,
            from: phone.startsWith('+') ? phone : (`+${phone}` as E164Phone),
            kind,
            ...(m.text?.body !== undefined && { text: m.text.body }),
            ...(mediaId !== undefined && { mediaId }),
            receivedAt: new Date(Number(m.timestamp ?? Date.now() / 1000) * 1000),
          });
        }
      }
    }
    return out;
  }

  async sendTemplate(msg: OutboundTemplateMessage): Promise<{ providerMessageId: string }> {
    const body = {
      messaging_product: 'whatsapp',
      to: stripPlus(msg.to),
      type: 'template',
      template: {
        name: msg.template,
        language: { code: 'es_AR' },
        components: variablesToComponents(msg.variables),
      },
    };
    return this.send(body);
  }

  async sendText(msg: OutboundTextMessage): Promise<{ providerMessageId: string }> {
    const body = {
      messaging_product: 'whatsapp',
      to: stripPlus(msg.to),
      type: 'text',
      text: { body: msg.text },
    };
    return this.send(body);
  }

  async downloadMedia(mediaId: string): Promise<{ contentType: string; bytes: ArrayBuffer }> {
    // Step 1: get media URL (Meta expires URLs in ~5min).
    const lookup = await fetch(`${this.baseUrl}/${mediaId}`, {
      headers: { authorization: `Bearer ${this.accessToken}` },
    });
    if (!lookup.ok) throw new Error(`media lookup failed: ${lookup.status}`);
    const meta = (await lookup.json()) as { url?: string; mime_type?: string };
    if (!meta.url) throw new Error('media url missing');

    // Step 2: download the bytes (auth header required).
    const dl = await fetch(meta.url, {
      headers: { authorization: `Bearer ${this.accessToken}` },
    });
    if (!dl.ok) throw new Error(`media download failed: ${dl.status}`);
    return {
      contentType: meta.mime_type ?? dl.headers.get('content-type') ?? 'application/octet-stream',
      bytes: await dl.arrayBuffer(),
    };
  }

  private async send(payload: unknown): Promise<{ providerMessageId: string }> {
    const r = await fetch(`${this.baseUrl}/${this.phoneId}/messages`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${this.accessToken}`,
      },
      body: JSON.stringify(payload),
    });
    if (!r.ok) throw new Error(`whatsapp send failed: ${r.status} ${await r.text()}`);
    const json = (await r.json()) as { messages?: Array<{ id: string }> };
    const id = json.messages?.[0]?.id;
    if (!id) throw new Error('whatsapp send response missing message id');
    return { providerMessageId: id };
  }
}

function stripPlus(p: string): string {
  return p.startsWith('+') ? p.slice(1) : p;
}

function variablesToComponents(vars: Record<string, string>): Array<{ type: string; parameters: Array<{ type: string; text: string }> }> {
  const params = Object.values(vars).map((text) => ({ type: 'text', text }));
  if (params.length === 0) return [];
  return [{ type: 'body', parameters: params }];
}

interface MetaWebhookPayload {
  entry?: Array<{
    changes?: Array<{
      value?: {
        messages?: Array<{
          id: string;
          from: string;
          type: string;
          timestamp?: string;
          text?: { body: string };
          image?: { id: string };
          audio?: { id: string };
        }>;
      };
    }>;
  }>;
}
