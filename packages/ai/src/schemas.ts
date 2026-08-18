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

/**
 * Tipo de ticket: define el circuito de gestión, no solo una etiqueta.
 * CONDUCTA es anónima frente a terceros, no se vota y apunta a la unidad de
 * otro vecino; INFRAESTRUCTURA es lo contrario en las tres cosas.
 */
export const TipoTicket = z.enum(['INFRAESTRUCTURA', 'CONDUCTA']);
export type TipoTicket = z.infer<typeof TipoTicket>;
export type Categoria = z.infer<typeof Categoria>;

/**
 * Lo que devuelve el MODELO. `modelo` y `prompt_version` no los produce el LLM:
 * los agrega el adaptador, así que pedírselos al modelo sería a la vez inútil y
 * una fuente de alucinación.
 */
export const ClassifierModelOutput = z.object({
  titulo: z.string().min(3).max(140).describe('Título corto y descriptivo del reporte'),
  descripcion_normalizada: z.string().min(1).max(2000).describe('El reporte reescrito de forma clara y neutra'),
  tipo: TipoTicket.describe('CONDUCTA si se queja del comportamiento de un vecino; si no, INFRAESTRUCTURA'),
  categoria: Categoria,
  unidad_reportada_texto: z
    .string()
    .max(60)
    .optional()
    .describe('Solo en CONDUCTA: la unidad del vecino señalado, tal como la escribió el residente'),
  origen: Origen,
  urgencia: Urgencia,
  ubicacion: z.string().max(200).optional().describe('Dónde ocurre, si el reporte lo menciona'),
  confianza: z.number().min(0).max(1).describe('Qué tan seguro está el modelo de esta clasificación'),
});
export type ClassifierModelOutput = z.infer<typeof ClassifierModelOutput>;

export const ClassifierOutput = z.object({
  titulo: z.string().min(3).max(140),
  descripcion_normalizada: z.string().min(1).max(2000),
  tipo: TipoTicket,
  categoria: Categoria,
  unidad_reportada_texto: z.string().max(60).optional(),
  origen: Origen,
  urgencia: Urgencia,
  ubicacion: z.string().max(200).optional(),
  confianza: z.number().min(0).max(1),
  modelo: z.string(),
  prompt_version: z.string(),
});
export type ClassifierOutput = z.infer<typeof ClassifierOutput>;
