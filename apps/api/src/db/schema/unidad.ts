import { sql } from 'drizzle-orm';
import { pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { consorcio } from './consorcio.js';
import { tenant } from './tenant.js';

export const unidad = pgTable(
  'unidad',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    tenantId: uuid('tenant_id').notNull().references(() => tenant.id, { onDelete: 'cascade' }),
    consorcioId: uuid('consorcio_id').notNull().references(() => consorcio.id, { onDelete: 'cascade' }),
    etiqueta: text('etiqueta').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    consorcioEtiquetaUnique: uniqueIndex('unidad_consorcio_etiqueta_unique').on(t.consorcioId, t.etiqueta),
  }),
);

export type Unidad = typeof unidad.$inferSelect;
export type NewUnidad = typeof unidad.$inferInsert;
