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
  /**
   * Si el mensaje no contiene ningún problema que registrar.
   *
   * Sin este campo el modelo está obligado a clasificar cualquier texto, así que
   * lo inventa: un "Gracias" salía como "Agujero en el techo del pasillo", con
   * urgencia alta, listo para ensuciar la bandeja de la administración. Un
   * clasificador que no puede abstenerse alucina.
   */
  es_reporte: z
    .boolean()
    .describe('false si el mensaje no describe ningún problema (saludos, gracias, preguntas, charla)'),
  titulo: z.string().min(3).max(140).describe('Título corto y descriptivo del reporte'),
  descripcion_normalizada: z.string().min(1).max(2000).describe('El reporte reescrito de forma clara y neutra'),
  tipo: TipoTicket.describe('CONDUCTA si se queja del comportamiento de un vecino; si no, INFRAESTRUCTURA'),
  categoria: Categoria,
  // `nullable` y no `optional`: el modo estricto de salida estructurada de
  // OpenAI exige que TODAS las propiedades estén en `required`, y un campo
  // opcional queda afuera —la API rechaza la llamada entera con
  // "Missing 'unidad_reportada_texto'"—. Nullable expresa lo mismo de una forma
  // que el modo estricto acepta: el campo siempre viene, con null cuando no
  // aplica. Esto es lo que hacía que el clasificador real no funcionara nunca,
  // y solo se podía descubrir con una API key de verdad.
  unidad_reportada_texto: z
    .string()
    .max(60)
    .nullable()
    .describe('Solo en CONDUCTA: la unidad del vecino señalado, tal como la escribió el residente. null si no aplica'),
  origen: Origen,
  urgencia: Urgencia,
  ubicacion: z
    .string()
    .max(200)
    .nullable()
    .describe('Dónde ocurre, si el reporte lo menciona. null si no lo dice'),
  confianza: z.number().min(0).max(1).describe('Qué tan seguro está el modelo de esta clasificación'),
});
export type ClassifierModelOutput = z.infer<typeof ClassifierModelOutput>;

export const ClassifierOutput = z.object({
  // Los registros anteriores a este campo no lo tienen: se asume que sí eran
  // reportes, porque llegaron a crear un ticket.
  es_reporte: z.boolean().default(true),
  titulo: z.string().min(3).max(140),
  descripcion_normalizada: z.string().min(1).max(2000),
  tipo: TipoTicket,
  categoria: Categoria,
  // Acepta ausente y null: el modelo real manda null explícito, y el mock —o un
  // registro viejo— puede omitirlo.
  unidad_reportada_texto: z.string().max(60).nullish(),
  origen: Origen,
  urgencia: Urgencia,
  ubicacion: z.string().max(200).nullish(),
  confianza: z.number().min(0).max(1),
  modelo: z.string(),
  prompt_version: z.string(),
});
export type ClassifierOutput = z.infer<typeof ClassifierOutput>;
