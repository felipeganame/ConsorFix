import type { IEmbedder } from './ports.js';

/**
 * Voyage AI embeddings — recomendado por Anthropic para uso conjunto.
 * Modelo por defecto: `voyage-3-lite` (32 dim default — pero soporta 256/512/1024).
 * Para coincidir con la columna pgvector(384) usamos `voyage-3` con dim=512
 * y truncamos primeros 384 (no es ideal — alternativa: migrar columna).
 *
 * Para MVP: si el modelo no soporta exactamente 384, fallback a OpenAI.
 */
export class VoyageEmbedder implements IEmbedder {
  constructor(
    private readonly apiKey: string,
    private readonly model: string = process.env.AI_EMBEDDER_MODEL ?? 'voyage-3-lite',
    private readonly baseUrl: string = 'https://api.voyageai.com/v1',
  ) {
    if (!apiKey) throw new Error('VOYAGE_API_KEY required for VoyageEmbedder');
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
        input: [text],
        input_type: 'document',
        output_dimension: 384,
      }),
    });
    if (!res.ok) throw new Error(`voyage embed failed: ${res.status} ${await res.text()}`);
    const json = (await res.json()) as { data?: Array<{ embedding?: number[] }> };
    const vec = json.data?.[0]?.embedding;
    if (!vec) throw new Error('voyage embed missing vector');
    // Truncar/padear a 384 por si el modelo elegido no respeta output_dimension.
    const v = vec.slice(0, 384);
    while (v.length < 384) v.push(0);
    return { vector: v, modelVersion: this.model };
  }
}
