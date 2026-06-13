import { sql } from 'drizzle-orm';
import { systemDb } from '../db/client.js';

/**
 * Búsqueda dedup vía pgvector cosine distance (operador `<=>`).
 * Filtros previos baratos (consorcio + estado abierto) ANTES del cálculo
 * vectorial para que ivfflat tenga selectividad (G14).
 *
 * Retorna el top match si su similitud (1 - dist) ≥ `threshold`.
 */
export interface DedupHit {
  ticketId: string;
  titulo: string;
  unidadId: string | null;
  similarity: number;
}

export async function findDedupCandidate(
  consorcioId: string,
  embedding: number[],
  opts: { threshold?: number; categoria?: string | null } = {},
): Promise<DedupHit | null> {
  const threshold = opts.threshold ?? 0.85;
  const vecLiteral = '[' + embedding.join(',') + ']';

  // Open states for dedup target: REGISTRADO + VALIDADO (no DESCARTADO/SOLUCIONADO).
  const result = await systemDb.execute<{
    id: string;
    titulo: string;
    unidad_id: string | null;
    similarity: number;
  }>(sql`
    SELECT
      t.id,
      t.titulo,
      t.unidad_id,
      1 - (t.embedding <=> ${vecLiteral}::vector) AS similarity
    FROM ticket t
    WHERE t.consorcio_id = ${consorcioId}
      AND t.estado IN ('REGISTRADO', 'VALIDADO')
      AND t.embedding IS NOT NULL
    ORDER BY t.embedding <=> ${vecLiteral}::vector
    LIMIT 1
  `);

  const row = result.rows[0];
  if (!row) return null;
  if (row.similarity < threshold) return null;
  return {
    ticketId: row.id,
    titulo: row.titulo,
    unidadId: row.unidad_id,
    similarity: row.similarity,
  };
}
