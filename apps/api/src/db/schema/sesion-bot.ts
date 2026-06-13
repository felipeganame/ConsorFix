import { sql } from 'drizzle-orm';
import { jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { consorcio } from './consorcio.js';
import { tenant } from './tenant.js';

export const sesionBot = pgTable(
  'sesion_bot',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    telefonoE164: text('telefono_e164').notNull(),
    tenantId: uuid('tenant_id').references(() => tenant.id, { onDelete: 'cascade' }),
    consorcioCtxId: uuid('consorcio_ctx_id').references(() => consorcio.id, { onDelete: 'set null' }),
    estadoFlujo: jsonb('estado_flujo').notNull().default(sql`'{}'::jsonb`),
    expiraAt: timestamp('expira_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ telefonoUnique: uniqueIndex('sesion_bot_telefono_unique').on(t.telefonoE164) }),
);

export type SesionBot = typeof sesionBot.$inferSelect;
export type NewSesionBot = typeof sesionBot.$inferInsert;
