import { z } from 'zod';

export const Uuid = z.string().uuid();
export type Uuid = z.infer<typeof Uuid>;

export const E164Phone = z.string().regex(/^\+[1-9]\d{6,14}$/, 'Phone must be E.164');
export type E164Phone = z.infer<typeof E164Phone>;

export const Urgencia = z.enum(['CRITICA', 'ALTA', 'MEDIA', 'BAJA']);
export type Urgencia = z.infer<typeof Urgencia>;

export const Origen = z.enum(['UNIDAD', 'ESPACIO_COMUN']);
export type Origen = z.infer<typeof Origen>;

export const TicketTipo = z.enum(['INFRAESTRUCTURA', 'CONDUCTA']);
export type TicketTipo = z.infer<typeof TicketTipo>;
