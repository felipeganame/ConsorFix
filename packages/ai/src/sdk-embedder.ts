import { embed } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import type { IEmbedder } from './ports.js';

/**
 * Embedder sobre Vercel AI SDK.
 *
 * La dimensión importa: `ticket.embedding` es `vector(384)`, y los modelos de
 * OpenAI devuelven 1536 (small) o 3072 (large) por defecto. Los modelos
 * `text-embedding-3-*` soportan reducción Matryoshka, así que se pide 384
 * explícitamente por `providerOptions` y el vector entra sin truncar.
 *
 * Es exactamente lo que el adaptador de Voyage hacía mal: pedía una dimensión
 * que Voyage no soporta (acepta 256/512/1024) y después truncaba y rellenaba
 * con ceros, lo que rompe la norma del vector y por lo tanto la similitud
 * coseno del dedup. Por eso Voyage no se migró: hay que arreglarlo o descartarlo.
 */
export const EMBEDDING_DIMS = 384;

export class SdkEmbedder implements IEmbedder {
  private readonly model;
  private readonly modelId: string;

  constructor(apiKey: string, model?: string) {
    if (!apiKey) throw new Error('OPENAI_API_KEY requerida para SdkEmbedder');
    this.modelId = model ?? process.env.AI_EMBEDDER_MODEL ?? 'text-embedding-3-small';
    const openai = createOpenAI({
      apiKey,
      ...(process.env.OPENAI_BASE_URL && { baseURL: process.env.OPENAI_BASE_URL }),
    });
    this.model = openai.textEmbeddingModel(this.modelId);
  }

  async embed(text: string): Promise<{ vector: number[]; modelVersion: string }> {
    const { embedding } = await embed({
      model: this.model,
      value: text,
      providerOptions: { openai: { dimensions: EMBEDDING_DIMS } },
      maxRetries: Number(process.env.AI_MAX_RETRIES ?? 2),
    });

    if (embedding.length !== EMBEDDING_DIMS) {
      // Fallar ruidosamente: un vector de otra dimensión no entra en la columna
      // y, si entrara, el coseno contra los ya guardados no significaría nada.
      throw new Error(
        `embedding de ${embedding.length} dims; la columna espera ${EMBEDDING_DIMS}. ` +
          `Revisá AI_EMBEDDER_MODEL (${this.modelId}): debe soportar reducción de dimensiones.`,
      );
    }

    return { vector: embedding, modelVersion: this.modelId };
  }
}
