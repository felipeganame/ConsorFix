import { z } from 'zod';
import { Origen, Urgencia } from '@consorciofix/contracts';

/**
 * Vocabulario cerrado de categorías. Debe coincidir EXACTAMENTE con el enum
 * del prompt (`classifier-v1.ts`): mientras esto era `z.string()` libre, el
 * mock emitía categorías que ningún proveedor real puede devolver, así que la
 * evaluación habría medido contra un vocabulario distinto al de producción.
 */
export const CATEGORIAS = [
  'plomeria',
  'electricidad',
  'ascensor',
  'limpieza',
  'seguridad',
  'conducta',
  'otros',
] as const;
export const Categoria = z.enum(CATEGORIAS);
export type Categoria = z.infer<typeof Categoria>;

/**
 * Lo que devuelve el MODELO. `modelo` y `prompt_version` no los produce el LLM:
 * los agrega el adaptador, así que pedírselos al modelo sería a la vez inútil y
 * una fuente de alucinación.
 */
export const ClassifierModelOutput = z.object({
  titulo: z.string().min(3).max(140).describe('Título corto y descriptivo del reporte'),
  descripcion_normalizada: z.string().min(1).max(2000).describe('El reporte reescrito de forma clara y neutra'),
  categoria: Categoria,
  origen: Origen,
  urgencia: Urgencia,
  ubicacion: z.string().max(200).optional().describe('Dónde ocurre, si el reporte lo menciona'),
  confianza: z.number().min(0).max(1).describe('Qué tan seguro está el modelo de esta clasificación'),
});
export type ClassifierModelOutput = z.infer<typeof ClassifierModelOutput>;

export const ClassifierOutput = z.object({
  titulo: z.string().min(3).max(140),
  descripcion_normalizada: z.string().min(1).max(2000),
  categoria: Categoria,
  origen: Origen,
  urgencia: Urgencia,
  ubicacion: z.string().max(200).optional(),
  confianza: z.number().min(0).max(1),
  modelo: z.string(),
  prompt_version: z.string(),
});
export type ClassifierOutput = z.infer<typeof ClassifierOutput>;
