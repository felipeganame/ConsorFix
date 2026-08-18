import { NotFoundException } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import type { PgColumn } from 'drizzle-orm/pg-core';
import type { TxClient } from '../db/client.js';

/**
 * Verifica que una fila referenciada pertenezca al tenant antes de apuntarle
 * una FK.
 *
 * **RLS no cubre esto.** Filtra las filas por `tenant_id`, pero no valida que
 * una FK apunte dentro del mismo tenant: la constraint solo exige que el id
 * exista. El resultado es una fila del tenant A referenciando datos del
 * tenant B — base incoherente, y los listados exponen ids ajenos.
 *
 * Verificado explotable en seis endpoints antes de este helper:
 *   POST /tickets             con `consorcio_id` ajeno, y con `unidad_id` ajena
 *   POST /tickets/:id/transitions  con `categoria_id` ajena
 *   POST /unidades y /unidades/bulk  con `consorcio_id` ajeno
 *   POST /vinculos            con `residente_id` y `unidad_id` ajenos
 *   POST /categorias          con `consorcio_id` ajeno
 *
 * Se responde 404 y no 403: un 403 confirmaría que el recurso existe en otro
 * tenant, que ya es información.
 *
 * Las columnas se piden explícitas en vez de derivarlas de la tabla. Es un poco
 * más verboso, pero una tabla sin `id` —como `clasificacion_ia`, cuya PK es
 * `ticket_id`— falla al COMPILAR en el call site en vez de explotar en runtime
 * con un `eq(undefined, ...)` de drizzle que no dice de dónde vino.
 */
export interface RefTenantScoped {
  columnaId: PgColumn;
  columnaTenant: PgColumn;
  nombre: string;
}

export async function assertMismoTenant(
  tx: TxClient,
  tenantId: string,
  ref: RefTenantScoped,
  valor: string,
): Promise<void> {
  const fila = await tx
    .select({ existe: ref.columnaId })
    .from(ref.columnaId.table)
    .where(and(eq(ref.columnaTenant, tenantId), eq(ref.columnaId, valor)))
    .limit(1);
  if (fila.length === 0) throw new NotFoundException(`${ref.nombre} not found`);
}
