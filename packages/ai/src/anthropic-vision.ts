import type { IImageVision, ImageVisionOutput } from './ports.js';
import { VISION_JSON_SCHEMA, VISION_PROMPT_VERSION, VISION_SYSTEM } from './prompts/vision-v1.js';

/**
 * Vision con Claude (3.5 Sonnet / Haiku). Image content block + tool_use forzado.
 */
export class AnthropicVision implements IImageVision {
  constructor(
    private readonly apiKey: string,
    private readonly model: string = process.env.AI_VISION_MODEL ?? 'claude-3-5-haiku-latest',
    private readonly baseUrl: string = process.env.ANTHROPIC_BASE_URL ?? 'https://api.anthropic.com/v1',
  ) {
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY required for AnthropicVision');
  }

  async describe(image: ArrayBuffer, opts: { contentType?: string; promptVersion: string }): Promise<ImageVisionOutput> {
    const b64 = Buffer.from(image).toString('base64');
    const mediaType = opts.contentType ?? 'image/jpeg';
    const res = await fetch(`${this.baseUrl}/messages`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: 512,
        system: VISION_SYSTEM,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: mediaType, data: b64 } },
              { type: 'text', text: 'Describí el problema en la foto en una oración corta.' },
            ],
          },
        ],
        tools: [
          {
            name: 'reporte_visual',
            description: 'Devolver la descripción estructurada de la imagen.',
            input_schema: VISION_JSON_SCHEMA,
          },
        ],
        tool_choice: { type: 'tool', name: 'reporte_visual' },
      }),
    });
    if (!res.ok) throw new Error(`anthropic vision failed: ${res.status} ${await res.text()}`);
    const json = (await res.json()) as {
      content?: Array<{ type: string; input?: Record<string, unknown> }>;
    };
    const toolUse = json.content?.find((c) => c.type === 'tool_use');
    if (!toolUse?.input) throw new Error('anthropic vision: no tool_use in response');
    return {
      ...(toolUse.input as Omit<ImageVisionOutput, 'modelo'>),
      modelo: this.model,
      ...(opts.promptVersion ? {} : { __prompt: VISION_PROMPT_VERSION }),
    };
  }
}
