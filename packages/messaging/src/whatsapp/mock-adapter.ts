import type { E164Phone } from '@consorciofix/contracts';
import type {
  IMessagingProvider,
  InboundMessage,
  OutboundTemplateMessage,
  OutboundTextMessage,
} from '../ports.js';
import { verifyMetaSignature } from './signature.js';

/**
 * Mock adapter pointing at the docker `mock-whatsapp` service.
 * - `parseWebhook` extracts inbound messages from a Meta-shaped payload.
 * - `sendText/sendTemplate` POST to the mock's `/v18.0/...` endpoint.
 * Signature verification reuses the production helper (off when secret empty).
 */
export class MockWhatsAppProvider implements IMessagingProvider {
  constructor(
    private readonly baseUrl: string = process.env.WHATSAPP_MOCK_URL ?? 'http://localhost:8081',
    private readonly appSecret: string = process.env.WHATSAPP_APP_SECRET ?? '',
  ) {}

  verifySignature(rawBody: string, signatureHeader: string | undefined): boolean {
    if (!this.appSecret) return true;
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
            receivedAt: new Date(Number(m.timestamp ?? Date.now()) * (m.timestamp ? 1000 : 1)),
          });
        }
      }
    }
    return out;
  }

  async sendTemplate(msg: OutboundTemplateMessage): Promise<{ providerMessageId: string }> {
    const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID ?? 'mock-phone';
    const r = await fetch(`${this.baseUrl}/v18.0/${phoneId}/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: stripPlus(msg.to),
        type: 'template',
        template: { name: msg.template, language: { code: 'es_AR' }, components: variablesToComponents(msg.variables) },
      }),
    });
    return parseSendResponse(r);
  }

  async sendText(msg: OutboundTextMessage): Promise<{ providerMessageId: string }> {
    const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID ?? 'mock-phone';
    const r = await fetch(`${this.baseUrl}/v18.0/${phoneId}/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: stripPlus(msg.to),
        type: 'text',
        text: { body: msg.text },
      }),
    });
    return parseSendResponse(r);
  }

  async downloadMedia(mediaId: string): Promise<{ contentType: string; bytes: ArrayBuffer }> {
    const r = await fetch(`${this.baseUrl}/media/${mediaId}`);
    if (!r.ok) throw new Error(`media download failed: ${r.status}`);
    const bytes = await r.arrayBuffer();
    return { contentType: r.headers.get('content-type') ?? 'application/octet-stream', bytes };
  }
}

async function parseSendResponse(r: Response): Promise<{ providerMessageId: string }> {
  if (!r.ok) throw new Error(`whatsapp send failed: ${r.status} ${await r.text()}`);
  const json = (await r.json()) as { messages?: Array<{ id: string }> };
  const id = json.messages?.[0]?.id;
  if (!id) throw new Error('whatsapp send response missing message id');
  return { providerMessageId: id };
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
