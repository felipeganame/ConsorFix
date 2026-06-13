import { sql } from 'drizzle-orm';
import { boolean, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { tenant } from './tenant.js';

export const usuarioAdmin = pgTable(
  'usuario_admin',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    tenantId: uuid('tenant_id').references(() => tenant.id, { onDelete: 'cascade' }),
    email: text('email').notNull(),
    passwordHash: text('password_hash').notNull(),
    rol: text('rol', { enum: ['SUPER_ADMIN', 'ADMIN'] }).notNull(),
    nombre: text('nombre').notNull(),
    activo: boolean('activo').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ emailUnique: uniqueIndex('usuario_admin_email_unique').on(t.email) }),
);

export type UsuarioAdmin = typeof usuarioAdmin.$inferSelect;
export type NewUsuarioAdmin = typeof usuarioAdmin.$inferInsert;
