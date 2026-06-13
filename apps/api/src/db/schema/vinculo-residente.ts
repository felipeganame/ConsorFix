import { sql } from 'drizzle-orm';
import { type AnyPgColumn, boolean, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { residente } from './residente.js';
import { tenant } from './tenant.js';
import { unidad } from './unidad.js';

export const vinculoResidente = pgTable(
  'vinculo_residente',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    tenantId: uuid('tenant_id').notNull().references(() => tenant.id, { onDelete: 'cascade' }),
    residenteId: uuid('residente_id').notNull().references(() => residente.id, { onDelete: 'cascade' }),
    unidadId: uuid('unidad_id').notNull().references(() => unidad.id, { onDelete: 'cascade' }),
    rol: text('rol', { enum: ['PROPIETARIO', 'INQUILINO'] }).notNull(),
    activo: boolean('activo').notNull().default(true),
    creadoPorId: uuid('creado_por_id').references((): AnyPgColumn => residente.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    vinculoUnique: uniqueIndex('vinculo_unique').on(t.residenteId, t.unidadId, t.rol),
  }),
);

export type VinculoResidente = typeof vinculoResidente.$inferSelect;
export type NewVinculoResidente = typeof vinculoResidente.$inferInsert;
