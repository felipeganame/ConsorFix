import { sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
  customType,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { categoria } from './categoria.js';
import { consorcio } from './consorcio.js';
import { residente } from './residente.js';
import { tenant } from './tenant.js';
import { unidad } from './unidad.js';

const vector = customType<{ data: number[]; driverData: string }>({
  dataType() {
    return 'vector(384)';
  },
  toDriver(value: number[]): string {
    return `[${value.join(',')}]`;
  },
  fromDriver(value: string): number[] {
    return value.replace(/[[\]]/g, '').split(',').map(Number);
  },
});

export const ticket = pgTable('ticket', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  tenantId: uuid('tenant_id').notNull().references(() => tenant.id, { onDelete: 'cascade' }),
  consorcioId: uuid('consorcio_id').notNull().references(() => consorcio.id, { onDelete: 'cascade' }),
  unidadId: uuid('unidad_id').references(() => unidad.id, { onDelete: 'set null' }),
  reportanteId: uuid('reportante_id').references(() => residente.id, { onDelete: 'set null' }),
  tipo: text('tipo', { enum: ['INFRAESTRUCTURA', 'CONDUCTA'] }).notNull(),
  origen: text('origen', { enum: ['UNIDAD', 'ESPACIO_COMUN'] }),
  urgencia: text('urgencia', { enum: ['CRITICA', 'ALTA', 'MEDIA', 'BAJA'] }).notNull(),
  estado: text('estado', {
    enum: ['REGISTRADO', 'VALIDADO', 'DESCARTADO', 'SOLUCIONADO'],
  }).notNull().default('REGISTRADO'),
  titulo: text('titulo').notNull(),
  descripcionNormalizada: text('descripcion_normalizada').notNull(),
  embedding: vector('embedding'),
  clientGeneratedId: uuid('client_generated_id'),
  shortCode: text('short_code'),
  votosCount: integer('votos_count').notNull().default(0),
  categoriaId: uuid('categoria_id').references(() => categoria.id, { onDelete: 'set null' }),
  duplicadoDeId: uuid('duplicado_de_id').references((): AnyPgColumn => ticket.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  validatedAt: timestamp('validated_at', { withTimezone: true }),
  solucionadoAt: timestamp('solucionado_at', { withTimezone: true }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type Ticket = typeof ticket.$inferSelect;
export type NewTicket = typeof ticket.$inferInsert;
