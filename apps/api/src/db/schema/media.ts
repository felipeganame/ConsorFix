import { sql } from 'drizzle-orm';
import { integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { tenant } from './tenant.js';
import { ticket } from './ticket.js';

export const media = pgTable('media', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  tenantId: uuid('tenant_id').notNull().references(() => tenant.id, { onDelete: 'cascade' }),
  ticketId: uuid('ticket_id').notNull().references(() => ticket.id, { onDelete: 'cascade' }),
  tipo: text('tipo', { enum: ['FOTO', 'AUDIO', 'COMPROBANTE'] }).notNull(),
  storageUrl: text('storage_url').notNull(),
  waMediaId: text('wa_media_id'),
  sizeBytes: integer('size_bytes'),
  mimeType: text('mime_type'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type Media = typeof media.$inferSelect;
export type NewMedia = typeof media.$inferInsert;
