import type { IClassifier } from './ports.js';
import {
  CLASSIFIER_JSON_SCHEMA,
  CLASSIFIER_PROMPT_VERSION,
  CLASSIFIER_SYSTEM,
} from './prompts/classifier-v1.js';
import { ClassifierOutput } from './schemas.js';

/**
 * Clasificador Anthropic (Claude). Usa `tool_use` con un tool obligatorio
 * (`tool_choice: { type: 'tool', name: 'reporte_clasificado' }`) — el modelo
 * está forzado a devolver el JSON shape del schema.
 *
 * Reemplazar `claude-3-5-haiku-latest` por el modelo deseado en env
 * AI_CLASSIFIER_MODEL si querés Sonnet/Opus.
 */
export class AnthropicClassifier implements IClassifier {
  constructor(
    private readonly apiKey: string,
    private readonly model: string = process.env.AI_CLASSIFIER_MODEL ?? 'claude-3-5-haiku-latest',
    private readonly baseUrl: string = process.env.ANTHROPIC_BASE_URL ?? 'https://api.anthropic.com/v1',
  ) {
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY required for AnthropicClassifier');
  }

  async classify(text: string, opts: { promptVersion: string }) {
    const res = await fetch(`${this.baseUrl}/messages`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: 1024,
        system: CLASSIFIER_SYSTEM,
        messages: [{ role: 'user', content: text }],
        tools: [
          {
            name: 'reporte_clasificado',
            description: 'Devolver el reporte clasificado en formato estructurado.',
            input_schema: CLASSIFIER_JSON_SCHEMA,
          },
        ],
        tool_choice: { type: 'tool', name: 'reporte_clasificado' },
      }),
    });
    if (!res.ok) {
      throw new Error(`anthropic classify failed: ${res.status} ${await res.text()}`);
    }
    const json = (await res.json()) as {
      content?: Array<{ type: string; name?: string; input?: Record<string, unknown> }>;
    };
    const toolUse = json.content?.find((c) => c.type === 'tool_use');
    if (!toolUse?.input) throw new Error('anthropic classify: no tool_use in response');
    return ClassifierOutput.parse({
      ...toolUse.input,
      modelo: this.model,
      prompt_version: opts.promptVersion || CLASSIFIER_PROMPT_VERSION,
    });
  }
}
