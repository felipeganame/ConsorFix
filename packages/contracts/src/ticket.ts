import { z } from 'zod';
import { Origen, TicketTipo, Urgencia, Uuid } from './common.js';

export const TicketState = z.enum(['REGISTRADO', 'VALIDADO', 'DESCARTADO', 'SOLUCIONADO']);
export type TicketState = z.infer<typeof TicketState>;

export const CreateTicketFromApp = z.object({
  client_generated_id: Uuid,
  consorcio_id: Uuid,
  unidad_id: Uuid.nullable(),
  tipo: TicketTipo,
  titulo: z.string().min(3).max(140),
  descripcion: z.string().min(1).max(4000),
  origen_sugerido: Origen.optional(),
  urgencia_sugerida: Urgencia.optional(),
  media_ids: z.array(Uuid).default([]),
});
export type CreateTicketFromApp = z.infer<typeof CreateTicketFromApp>;

export const TicketTransitionRequest = z.object({
  to: TicketState,
  nota: z.string().max(2000).optional(),
  // Al validar, admin confirma o corrige el origen sugerido por IA.
  origen: z.enum(['UNIDAD', 'ESPACIO_COMUN']).optional(),
  categoria_id: Uuid.optional(),
});
export type TicketTransitionRequest = z.infer<typeof TicketTransitionRequest>;

export const CreateGastoRequest = z.object({
  descripcion: z.string().min(1).max(280),
  monto: z.number().positive(),
  moneda: z.string().length(3).default('ARS'),
  comprobante_url: z.string().url().optional(),
  estado: z.enum(['BORRADOR', 'CONFIRMADO']).default('CONFIRMADO'),
});
export type CreateGastoRequest = z.infer<typeof CreateGastoRequest>;
