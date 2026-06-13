import { sql } from 'drizzle-orm';
import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { tenant } from './tenant.js';
import { ticket } from './ticket.js';
import { unidad } from './unidad.js';

export const registroConducta = pgTable('registro_conducta', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  tenantId: uuid('tenant_id').notNull().references(() => tenant.id, { onDelete: 'cascade' }),
  unidadId: uuid('unidad_id').notNull().references(() => unidad.id, { onDelete: 'cascade' }),
  ticketId: uuid('ticket_id').notNull().references(() => ticket.id, { onDelete: 'cascade' }),
  resultado: text('resultado', { enum: ['DESCARTADO', 'AVISO', 'SANCION'] }).notNull(),
  detalle: text('detalle'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type RegistroConducta = typeof registroConducta.$inferSelect;
export type NewRegistroConducta = typeof registroConducta.$inferInsert;
