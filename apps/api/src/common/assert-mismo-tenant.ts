import { NotFoundException } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import type { PgTable } from 'drizzle-orm/pg-core';
import type { TxClient } from '../db/client.js';

/**
 * Verifica que una fila referenciada pertenezca al tenant antes de apuntarle
 * una FK.
 *
 * **RLS no cubre esto.** Filtra las filas por `tenant_id`, pero no valida que
 * una FK apunte dentro del mismo tenant: la constraint solo exige que el id
 * exista. El resultado es una fila en el tenant A referenciando datos del
 * tenant B — base incoherente, y los listados exponen ids ajenos.
 *
 * Verificado explotable en tres endpoints antes de este helper:
 *   POST /tickets   con un consorcio_id ajeno
 *   POST /unidades  con un consorcio_id ajeno
 *   POST /vinculos  con residente_id y unidad_id ajenos (el listado los exponía)
 *
 * Se responde 404 y no 403: un 403 confirmaría que el recurso existe en otro
 * tenant, que ya es información.
 */
export async function assertMismoTenant(
  tx: TxClient,
  tenantId: string,
  tabla: PgTable & { id: never; tenantId: never },
  id: string,
  nombreRecurso: string,
): Promise<void> {
  const cols = tabla as unknown as { id: never; tenantId: never };
  const fila = await tx
    .select({ id: cols.id })
    .from(tabla)
    .where(and(eq(cols.tenantId, tenantId), eq(cols.id, id)))
    .limit(1);
  if (fila.length === 0) throw new NotFoundException(`${nombreRecurso} not found`);
}
