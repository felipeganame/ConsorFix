import { generateObject } from 'ai';
import type { z } from 'zod';
import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import type { LanguageModel } from 'ai';
import type { IClassifier } from './ports.js';
import { CLASSIFIER_PROMPT_VERSION, CLASSIFIER_SYSTEM } from './prompts/classifier-v1.js';
import { ClassifierModelOutput, ClassifierOutput } from './schemas.js';
import { calcularCosto } from './pricing.js';

/**
 * Clasificador sobre Vercel AI SDK — una sola implementación para los tres
 * proveedores.
 *
 * Reemplaza a `openai-classifier.ts`, `anthropic-classifier.ts` y
 * `google-classifier.ts`, que hacían `fetch` a mano y cada uno resolvía la
 * salida estructurada a su manera: OpenAI con `response_format`, Anthropic
 * parseando bloques `tool_use`, y Google con un `toGeminiSchema()` escrito a
 * mano que era el mapeo más frágil del paquete. `generateObject` valida contra
 * el schema Zod del lado del SDK y reintenta si el modelo se desvía.
 *
 * Sigue viviendo detrás del puerto `IClassifier`, así que nada fuera de este
 * paquete se entera (regla 10 de CLAUDE.md).
 *
 * Se fija `ai@^6` a propósito: la 7 es ESM-only y pide Node ≥22, mientras que
 * este monorepo es CommonJS con Node ≥20. Migrar NestJS a ESM no se justifica.
 */
export type SdkProvider = 'openai' | 'anthropic' | 'google';

const DEFAULT_MODELS: Record<SdkProvider, string> = {
  openai: 'gpt-4o-mini',
  anthropic: 'claude-haiku-4-5-20251001',
  google: 'gemini-2.0-flash',
};

function resolveModel(provider: SdkProvider, apiKey: string, model: string): LanguageModel {
  switch (provider) {
    case 'openai': {
      const openai = createOpenAI({
        apiKey,
        ...(process.env.OPENAI_BASE_URL && { baseURL: process.env.OPENAI_BASE_URL }),
      });
      return openai(model);
    }
    case 'anthropic': {
      const anthropic = createAnthropic({
        apiKey,
        ...(process.env.ANTHROPIC_BASE_URL && { baseURL: process.env.ANTHROPIC_BASE_URL }),
      });
      return anthropic(model);
    }
    case 'google': {
      const google = createGoogleGenerativeAI({
        apiKey,
        ...(process.env.GOOGLE_BASE_URL && { baseURL: process.env.GOOGLE_BASE_URL }),
      });
      return google(model);
    }
  }
}

export class SdkClassifier implements IClassifier {
  private readonly model: LanguageModel;
  private readonly modelId: string;

  constructor(provider: SdkProvider, apiKey: string, model?: string) {
    if (!apiKey) throw new Error(`API key requerida para el clasificador ${provider}`);
    this.modelId = model ?? process.env.AI_CLASSIFIER_MODEL ?? DEFAULT_MODELS[provider];
    this.model = resolveModel(provider, apiKey, this.modelId);
  }

  async classify(text: string, opts: { promptVersion: string }) {
    const schema: z.ZodType<ClassifierModelOutput> = ClassifierModelOutput;

    // El cast es deliberado y está acotado a esta llamada: los genéricos de
    // `generateObject` combinados con la inferencia de Zod hacen explotar la
    // profundidad de instanciación del compilador (TS2589). No se pierde
    // seguridad real porque la salida se revalida con Zod en la línea de abajo,
    // que es donde de verdad importa: el modelo puede devolver cualquier cosa.
    const generate = generateObject as unknown as (
      args: Record<string, unknown>,
    ) => Promise<{ object: unknown; usage?: { inputTokens?: number; outputTokens?: number } }>;

    const t0 = Date.now();
    const { object, usage } = await generate({
      model: this.model,
      schema,
      system: CLASSIFIER_SYSTEM,
      prompt: text,
      temperature: 0,
      // Los adaptadores a mano no reintentaban nada: un 429 o un 500 transitorio
      // del proveedor tiraba el reporte del residente.
      maxRetries: Number(process.env.AI_MAX_RETRIES ?? 2),
    });

    const latenciaMs = Date.now() - t0;
    const parsed = ClassifierOutput.parse({
      ...(object as Record<string, unknown>),
      modelo: this.modelId,
      prompt_version: opts.promptVersion || CLASSIFIER_PROMPT_VERSION,
    });

    // RF-C07: el uso ya viene en la respuesta del SDK; antes se descartaba.
    const tokensIn = usage?.inputTokens;
    const tokensOut = usage?.outputTokens;
    return {
      ...parsed,
      uso: {
        ...(tokensIn !== undefined && { tokensIn }),
        ...(tokensOut !== undefined && { tokensOut }),
        ...(() => {
          const costoUsd = calcularCosto(this.modelId, tokensIn, tokensOut);
          return costoUsd !== undefined ? { costoUsd } : {};
        })(),
        latenciaMs,
        cacheHit: false,
      },
    };
  }
}
