import { readFileSync } from 'node:fs';
import { z } from 'zod';
import { Categoria, Intencion, TipoTicket } from '../schemas.js';
import { Origen, Urgencia } from '@consorciofix/contracts';

/**
 * Dataset de evaluación del clasificador (tarea 3.2 del plan, gap G16).
 *
 * Formato JSONL, un caso por línea. Se eligió JSONL sobre un JSON único
 * porque: diffea limpio en git (un caso corregido = una línea cambiada),
 * se le pueden apendear los casos reales del piloto sin reescribir el
 * archivo, y se puede streamear si crece.
 *
 * `expected` admite claves parciales: un caso puede existir solo para medir
 * urgencia (ej. los casos trampa de tono) sin comprometerse con una categoría.
 */
export const EvalCase = z.object({
  id: z.string().min(1),
  text: z.string().min(1),
  expected: z
    .object({
      intencion: Intencion.optional(),
      tipo: TipoTicket.optional(),
      origen: Origen.optional(),
      categoria: Categoria.optional(),
      urgencia: Urgencia.optional(),
    })
    .refine((e) => e.intencion || e.tipo || e.origen || e.categoria || e.urgencia, {
      message: 'expected debe fijar al menos una de intencion/tipo/origen/categoria/urgencia',
    }),
  /** `synthetic` = escrito a mano; `piloto` = caso real anonimizado (G16). */
  source: z.enum(['synthetic', 'piloto']).default('synthetic'),
  /** Marca los casos diseñados para una trampa concreta. Útil para reportar. */
  tags: z.array(z.string()).optional(),
});
export type EvalCase = z.infer<typeof EvalCase>;

export function loadDataset(path: string): EvalCase[] {
  const raw = readFileSync(path, 'utf8');
  const casos: EvalCase[] = [];
  const vistos = new Set<string>();

  raw.split('\n').forEach((linea, i) => {
    const t = linea.trim();
    if (!t || t.startsWith('//')) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(t);
    } catch {
      throw new Error(`dataset: línea ${i + 1} no es JSON válido`);
    }
    const res = EvalCase.safeParse(parsed);
    if (!res.success) {
      throw new Error(`dataset: línea ${i + 1} inválida — ${res.error.issues[0]?.message}`);
    }
    if (vistos.has(res.data.id)) {
      throw new Error(`dataset: id duplicado "${res.data.id}" en línea ${i + 1}`);
    }
    vistos.add(res.data.id);
    casos.push(res.data);
  });

  if (casos.length === 0) throw new Error('dataset vacío');
  return casos;
}

/** Reparto de casos por clase, para detectar un dataset desbalanceado. */
export function resumenDataset(casos: EvalCase[]): string {
  const contar = (key: 'tipo' | 'origen' | 'categoria' | 'urgencia') => {
    const m = new Map<string, number>();
    for (const c of casos) {
      const v = c.expected[key];
      if (v) m.set(v, (m.get(v) ?? 0) + 1);
    }
    return Array.from(m.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => `${k}=${v}`)
      .join(' ');
  };
  const piloto = casos.filter((c) => c.source === 'piloto').length;
  return [
    `  casos: ${casos.length} (sintéticos ${casos.length - piloto}, piloto ${piloto})`,
    `  tipo:      ${contar('tipo')}`,
    `  origen:    ${contar('origen')}`,
    `  categoria: ${contar('categoria')}`,
    `  urgencia:  ${contar('urgencia')}`,
  ].join('\n');
}
