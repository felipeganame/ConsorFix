import type { IImageVision, ImageVisionOutput } from './ports.js';
import { VISION_JSON_SCHEMA, VISION_PROMPT_VERSION, VISION_SYSTEM } from './prompts/vision-v1.js';

/**
 * Vision con GPT-4o/4o-mini (multimodal). Estructura JSON via response_format.
 */
export class OpenAIVision implements IImageVision {
  constructor(
    private readonly apiKey: string,
    private readonly model: string = process.env.AI_VISION_MODEL ?? 'gpt-4o-mini',
    private readonly baseUrl: string = process.env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1',
  ) {
    if (!apiKey) throw new Error('OPENAI_API_KEY required for OpenAIVision');
  }

  async describe(image: ArrayBuffer, opts: { contentType?: string; promptVersion: string }): Promise<ImageVisionOutput> {
    const b64 = Buffer.from(image).toString('base64');
    const dataUrl = `data:${opts.contentType ?? 'image/jpeg'};base64,${b64}`;
    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages: [
          { role: 'system', content: VISION_SYSTEM },
          {
            role: 'user',
            content: [
              { type: 'text', text: 'Describí el problema en la foto en una oración corta.' },
              { type: 'image_url', image_url: { url: dataUrl } },
            ],
          },
        ],
        response_format: {
          type: 'json_schema',
          json_schema: { name: 'vision_output', strict: true, schema: VISION_JSON_SCHEMA },
        },
        temperature: 0,
      }),
    });
    if (!res.ok) throw new Error(`openai vision failed: ${res.status} ${await res.text()}`);
    const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const content = json.choices?.[0]?.message?.content;
    if (!content) throw new Error('openai vision empty content');
    const parsed = JSON.parse(content) as Omit<ImageVisionOutput, 'modelo'>;
    return { ...parsed, modelo: this.model, ...(opts.promptVersion ? {} : { __prompt: VISION_PROMPT_VERSION }) };
  }
}
