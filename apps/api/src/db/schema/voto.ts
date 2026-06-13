import { sql } from 'drizzle-orm';
import { pgTable, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { residente } from './residente.js';
import { tenant } from './tenant.js';
import { ticket } from './ticket.js';

export const voto = pgTable(
  'voto',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    tenantId: uuid('tenant_id').notNull().references(() => tenant.id, { onDelete: 'cascade' }),
    ticketId: uuid('ticket_id').notNull().references(() => ticket.id, { onDelete: 'cascade' }),
    residenteId: uuid('residente_id').notNull().references(() => residente.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    ticketResidenteUnique: uniqueIndex('voto_ticket_residente_unique').on(t.ticketId, t.residenteId),
  }),
);

export type Voto = typeof voto.$inferSelect;
export type NewVoto = typeof voto.$inferInsert;
