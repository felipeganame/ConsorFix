import { boolean, integer, jsonb, numeric, pgTable, real, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { tenant } from './tenant.js';
import { ticket } from './ticket.js';

export const clasificacionIa = pgTable('clasificacion_ia', {
  ticketId: uuid('ticket_id').primaryKey().references(() => ticket.id, { onDelete: 'cascade' }),
  tenantId: uuid('tenant_id').notNull().references(() => tenant.id, { onDelete: 'cascade' }),
  sugerido: jsonb('sugerido').notNull(),
  corregidoPorAdmin: jsonb('corregido_por_admin'),
  confianza: real('confianza'),
  modelo: text('modelo').notNull(),
  promptVersion: text('prompt_version').notNull(),
  // Telemetría de costo (RF-C07, migración 0006).
  tokensIn: integer('tokens_in'),
  tokensOut: integer('tokens_out'),
  costoUsd: numeric('costo_usd', { precision: 12, scale: 6 }),
  latenciaMs: integer('latencia_ms'),
  cacheHit: boolean('cache_hit').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type ClasificacionIa = typeof clasificacionIa.$inferSelect;
export type NewClasificacionIa = typeof clasificacionIa.$inferInsert;
