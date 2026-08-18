import { sql } from 'drizzle-orm';
import { boolean, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { tenant } from './tenant.js';

export const residente = pgTable(
  'residente',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    tenantId: uuid('tenant_id').notNull().references(() => tenant.id, { onDelete: 'cascade' }),
    nombre: text('nombre').notNull(),
    telefonoE164: text('telefono_e164').notNull(),
    email: text('email'),
    /** Chat de Telegram vinculado (migración 0005). Único en todo el sistema. */
    telegramChatId: text('telegram_chat_id'),
    telegramVinculadoAt: timestamp('telegram_vinculado_at', { withTimezone: true }),
    /**
     * Último mensaje entrante del residente. Define la ventana de 24 h de
     * WhatsApp (RF-G02): dentro se puede mandar texto libre, fuera hace falta
     * una plantilla aprobada.
     */
    ultimoInboundAt: timestamp('ultimo_inbound_at', { withTimezone: true }),
    passwordHash: text('password_hash'),
    activo: boolean('activo').notNull().default(true),
    pushToken: text('push_token'),
    pushTokenUpdatedAt: timestamp('push_token_updated_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantTelefonoUnique: uniqueIndex('residente_tenant_telefono_unique').on(t.tenantId, t.telefonoE164),
  }),
);

export type Residente = typeof residente.$inferSelect;
export type NewResidente = typeof residente.$inferInsert;
