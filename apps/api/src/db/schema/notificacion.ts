import { sql } from 'drizzle-orm';
import { integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { tenant } from './tenant.js';
import { ticket } from './ticket.js';

export const notificacion = pgTable('notificacion', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  tenantId: uuid('tenant_id').notNull().references(() => tenant.id, { onDelete: 'cascade' }),
  ticketId: uuid('ticket_id').notNull().references(() => ticket.id, { onDelete: 'cascade' }),
  destinatarioId: uuid('destinatario_id').notNull(),
  destinatarioTipo: text('destinatario_tipo', { enum: ['RESIDENTE', 'ADMIN'] }).notNull(),
  canal: text('canal', { enum: ['WHATSAPP', 'PUSH', 'EMAIL'] }).notNull(),
  plantilla: text('plantilla').notNull(),
  estado: text('estado', { enum: ['PENDIENTE', 'ENVIADA', 'FALLIDA'] }).notNull().default('PENDIENTE'),
  intentos: integer('intentos').notNull().default(0),
  providerMessageId: text('provider_message_id'),
  error: text('error'),
  // Reintentos durables (migración 0007).
  proximoIntentoAt: timestamp('proximo_intento_at', { withTimezone: true }),
  ultimoIntentoAt: timestamp('ultimo_intento_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type Notificacion = typeof notificacion.$inferSelect;
export type NewNotificacion = typeof notificacion.$inferInsert;
