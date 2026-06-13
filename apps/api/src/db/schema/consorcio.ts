import { sql } from 'drizzle-orm';
import { boolean, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { tenant } from './tenant.js';

export const consorcio = pgTable('consorcio', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenant.id, { onDelete: 'cascade' }),
  nombre: text('nombre').notNull(),
  tipo: text('tipo', { enum: ['EDIFICIO', 'BARRIO', 'OFICINAS'] }).notNull(),
  direccion: text('direccion'),
  archivado: boolean('archivado').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type Consorcio = typeof consorcio.$inferSelect;
export type NewConsorcio = typeof consorcio.$inferInsert;
