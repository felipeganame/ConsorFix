import { z } from 'zod';
import { Origen, Urgencia } from '@consorciofix/contracts';

export const ClassifierOutput = z.object({
  titulo: z.string().min(3).max(140),
  descripcion_normalizada: z.string().min(1).max(2000),
  categoria: z.string().min(1).max(60),
  origen: Origen,
  urgencia: Urgencia,
  ubicacion: z.string().max(200).optional(),
  confianza: z.number().min(0).max(1),
  modelo: z.string(),
  prompt_version: z.string(),
});
export type ClassifierOutput = z.infer<typeof ClassifierOutput>;
