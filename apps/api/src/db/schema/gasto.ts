import { sql } from 'drizzle-orm';
import { numeric, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { tenant } from './tenant.js';
import { ticket } from './ticket.js';
import { usuarioAdmin } from './usuario-admin.js';

export const gasto = pgTable('gasto', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  tenantId: uuid('tenant_id').notNull().references(() => tenant.id, { onDelete: 'cascade' }),
  ticketId: uuid('ticket_id').notNull().references(() => ticket.id, { onDelete: 'cascade' }),
  descripcion: text('descripcion').notNull(),
  monto: numeric('monto', { precision: 14, scale: 2 }).notNull(),
  moneda: text('moneda').notNull().default('ARS'),
  comprobanteUrl: text('comprobante_url'),
  estado: text('estado', { enum: ['BORRADOR', 'CONFIRMADO'] }).notNull().default('BORRADOR'),
  cargadoPorId: uuid('cargado_por_id').references(() => usuarioAdmin.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type Gasto = typeof gasto.$inferSelect;
export type NewGasto = typeof gasto.$inferInsert;
