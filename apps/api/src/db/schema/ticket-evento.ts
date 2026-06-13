import { sql } from 'drizzle-orm';
import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { tenant } from './tenant.js';
import { ticket } from './ticket.js';

export const ticketEvento = pgTable('ticket_evento', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  tenantId: uuid('tenant_id').notNull().references(() => tenant.id, { onDelete: 'cascade' }),
  ticketId: uuid('ticket_id').notNull().references(() => ticket.id, { onDelete: 'cascade' }),
  transicion: text('transicion').notNull(),
  estadoAnterior: text('estado_anterior'),
  estadoNuevo: text('estado_nuevo').notNull(),
  autorId: uuid('autor_id'),
  autorTipo: text('autor_tipo', { enum: ['ADMIN', 'SISTEMA', 'BOT', 'RESIDENTE'] }).notNull(),
  nota: text('nota'),
  at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
});

export type TicketEvento = typeof ticketEvento.$inferSelect;
export type NewTicketEvento = typeof ticketEvento.$inferInsert;
