import { sql } from 'drizzle-orm';
import { jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

export const webhookEvent = pgTable(
  'webhook_event',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    provider: text('provider').notNull().default('whatsapp'),
    wamid: text('wamid').notNull(),
    fromPhone: text('from_phone'),
    payload: jsonb('payload').notNull(),
    estado: text('estado', { enum: ['RECIBIDO', 'PROCESADO', 'ERROR'] }).notNull().default('RECIBIDO'),
    error: text('error'),
    receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
    processedAt: timestamp('processed_at', { withTimezone: true }),
  },
  (t) => ({ wamidUnique: uniqueIndex('webhook_event_wamid_unique').on(t.provider, t.wamid) }),
);

export type WebhookEvent = typeof webhookEvent.$inferSelect;
export type NewWebhookEvent = typeof webhookEvent.$inferInsert;
