import type { IClassifier } from './ports.js';
import {
  CLASSIFIER_JSON_SCHEMA,
  CLASSIFIER_PROMPT_VERSION,
  CLASSIFIER_SYSTEM,
} from './prompts/classifier-v1.js';
import { ClassifierOutput } from './schemas.js';

/**
 * Clasificador Google Gemini con `response_schema` (Generative Language API).
 * Modelo por defecto: `gemini-1.5-flash`. Cambiar via AI_CLASSIFIER_MODEL.
 *
 * Gemini exige el schema en un formato propio (subset de OpenAPI 3.0): se hace
 * un mapeo mínimo desde el JSON Schema canónico.
 */
export class GoogleClassifier implements IClassifier {
  constructor(
    private readonly apiKey: string,
    private readonly model: string = process.env.AI_CLASSIFIER_MODEL ?? 'gemini-1.5-flash',
    private readonly baseUrl: string = process.env.GOOGLE_BASE_URL ?? 'https://generativelanguage.googleapis.com/v1beta',
  ) {
    if (!apiKey) throw new Error('GOOGLE_API_KEY required for GoogleClassifier');
  }

  async classify(text: string, opts: { promptVersion: string }) {
    const res = await fetch(
      `${this.baseUrl}/models/${this.model}:generateContent?key=${this.apiKey}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: CLASSIFIER_SYSTEM }] },
          contents: [{ role: 'user', parts: [{ text }] }],
          generationConfig: {
            response_mime_type: 'application/json',
            response_schema: toGeminiSchema(CLASSIFIER_JSON_SCHEMA),
            temperature: 0,
          },
        }),
      },
    );
    if (!res.ok) throw new Error(`google classify failed: ${res.status} ${await res.text()}`);
    const json = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const content = json.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!content) throw new Error('google classify empty content');
    const parsed = JSON.parse(content) as Record<string, unknown>;
    return ClassifierOutput.parse({
      ...parsed,
      modelo: this.model,
      prompt_version: opts.promptVersion || CLASSIFIER_PROMPT_VERSION,
    });
  }
}

/** OpenAPI-3 subset compatible with Gemini's response_schema. */
function toGeminiSchema(input: unknown): unknown {
  if (input === null || typeof input !== 'object') return input;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const s = input as Record<string, any>;
  // Gemini doesn't accept "additionalProperties" or "type" arrays — strip both.
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(s)) {
    if (k === 'additionalProperties') continue;
    if (k === 'type' && Array.isArray(v)) {
      // ['string','null'] → 'string', nullable: true
      const nonNull = (v as string[]).find((t) => t !== 'null');
      out.type = nonNull?.toUpperCase() ?? 'STRING';
      if (v.includes('null')) out.nullable = true;
      continue;
    }
    if (k === 'type' && typeof v === 'string') {
      out.type = v.toUpperCase();
      continue;
    }
    if (k === 'properties' && typeof v === 'object') {
      const props: Record<string, unknown> = {};
      for (const [pk, pv] of Object.entries(v)) props[pk] = toGeminiSchema(pv);
      out.properties = props;
      continue;
    }
    if (k === 'items') {
      out.items = toGeminiSchema(v);
      continue;
    }
    out[k] = v;
  }
  return out;
}
