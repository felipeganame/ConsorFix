import type { IClassifier } from './ports.js';
import {
  CLASSIFIER_JSON_SCHEMA,
  CLASSIFIER_PROMPT_VERSION,
  CLASSIFIER_SYSTEM,
} from './prompts/classifier-v1.js';
import { ClassifierOutput } from './schemas.js';

/**
 * Clasificador real contra OpenAI Chat Completions con structured output
 * (response_format = json_schema). Sin dependencia del SDK — usa fetch.
 *
 * Errores de red o de validación del schema NO se silencian: el caller
 * (BotService) debe atraparlos y degradar o reintentar.
 */
export class OpenAIClassifier implements IClassifier {
  constructor(
    private readonly apiKey: string,
    private readonly model: string = process.env.AI_CLASSIFIER_MODEL ?? 'gpt-4o-mini',
    private readonly baseUrl: string = process.env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1',
  ) {
    if (!apiKey) throw new Error('OPENAI_API_KEY required for OpenAIClassifier');
  }

  async classify(text: string, opts: { promptVersion: string }) {
    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages: [
          { role: 'system', content: CLASSIFIER_SYSTEM },
          { role: 'user', content: text },
        ],
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'reporte_clasificado',
            strict: true,
            schema: CLASSIFIER_JSON_SCHEMA,
          },
        },
        temperature: 0,
      }),
    });
    if (!res.ok) {
      throw new Error(`openai classify failed: ${res.status} ${await res.text()}`);
    }
    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    const content = json.choices?.[0]?.message?.content;
    if (!content) throw new Error('openai classify empty content');
    const parsed = JSON.parse(content) as Record<string, unknown>;
    return ClassifierOutput.parse({
      ...parsed,
      modelo: this.model,
      prompt_version: opts.promptVersion || CLASSIFIER_PROMPT_VERSION,
    });
  }
}
