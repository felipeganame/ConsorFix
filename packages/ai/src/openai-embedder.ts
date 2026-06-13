import type { IEmbedder } from './ports.js';

/**
 * OpenAI embeddings adapter (text-embedding-3-small por default — 384 dims).
 * Para usar 1536 dims (large), cambiar AI_EMBEDDER_MODEL en env y migrar
 * la columna `ticket.embedding` a vector(1536).
 */
export class OpenAIEmbedder implements IEmbedder {
  constructor(
    private readonly apiKey: string,
    private readonly model: string = process.env.AI_EMBEDDER_MODEL ?? 'text-embedding-3-small',
    private readonly baseUrl: string = process.env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1',
  ) {
    if (!apiKey) throw new Error('OPENAI_API_KEY required for OpenAIEmbedder');
  }

  async embed(text: string): Promise<{ vector: number[]; modelVersion: string }> {
    const res = await fetch(`${this.baseUrl}/embeddings`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        input: text,
        // Force 384-dim output so it fits ticket.embedding vector(384) column.
        dimensions: 384,
      }),
    });
    if (!res.ok) throw new Error(`openai embed failed: ${res.status} ${await res.text()}`);
    const json = (await res.json()) as { data?: Array<{ embedding?: number[] }> };
    const vec = json.data?.[0]?.embedding;
    if (!vec || !Array.isArray(vec)) throw new Error('openai embed missing vector');
    return { vector: vec, modelVersion: this.model };
  }
}
