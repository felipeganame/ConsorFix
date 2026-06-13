import { sql } from 'drizzle-orm';
import { jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { tenant } from './tenant.js';

export const auditLog = pgTable('audit_log', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  tenantId: uuid('tenant_id').notNull().references(() => tenant.id, { onDelete: 'cascade' }),
  actorId: uuid('actor_id'),
  actorTipo: text('actor_tipo', { enum: ['ADMIN', 'SUPER_ADMIN', 'SISTEMA'] }).notNull(),
  accion: text('accion').notNull(),
  entidad: text('entidad').notNull(),
  entidadId: uuid('entidad_id'),
  detalle: jsonb('detalle'),
  at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
});

export type AuditLog = typeof auditLog.$inferSelect;
export type NewAuditLog = typeof auditLog.$inferInsert;
