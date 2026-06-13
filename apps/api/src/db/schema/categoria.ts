import { sql } from 'drizzle-orm';
import { boolean, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { consorcio } from './consorcio.js';
import { tenant } from './tenant.js';

export const categoria = pgTable(
  'categoria',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    tenantId: uuid('tenant_id').notNull().references(() => tenant.id, { onDelete: 'cascade' }),
    consorcioId: uuid('consorcio_id').notNull().references(() => consorcio.id, { onDelete: 'cascade' }),
    nombre: text('nombre').notNull(),
    esConducta: boolean('es_conducta').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    consorcioNombreUnique: uniqueIndex('categoria_consorcio_nombre_unique').on(t.consorcioId, t.nombre),
  }),
);

export type Categoria = typeof categoria.$inferSelect;
export type NewCategoria = typeof categoria.$inferInsert;
