import type { IEmbedder } from './ports.js';

/**
 * Embedder determinístico — bag-of-words sobre 384 dims con hashing.
 * Suficiente para detectar similitudes lexicales en dev/tests sin red.
 * NO usa pgvector real: produce vectores normalizados que el coseno puede
 * comparar de manera estable.
 */
export class MockEmbedder implements IEmbedder {
  private readonly dim = 384;

  async embed(text: string): Promise<{ vector: number[]; modelVersion: string }> {
    const v = new Array(this.dim).fill(0) as number[];
    const tokens = text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length >= 3);
    for (const token of tokens) {
      const idx = hashToIndex(token, this.dim);
      v[idx] = (v[idx] ?? 0) + 1;
    }
    const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
    return { vector: v.map((x) => x / norm), modelVersion: 'mock-embedder@0.0.1' };
  }
}

function hashToIndex(s: string, mod: number): number {
  // FNV-1a 32-bit
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h) % mod;
}
