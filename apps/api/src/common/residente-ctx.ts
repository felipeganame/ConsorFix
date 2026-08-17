import { and, eq, inArray } from 'drizzle-orm';
import type { ResidenteCtx } from '@consorciofix/domain';
import { unidad, vinculoResidente } from '../db/schema/index.js';
import type { TxClient } from '../db/client.js';

/**
 * Resuelve el contexto row-level de un residente: en qué unidades tiene
 * vínculo activo y, por transitividad, a qué consorcios pertenece.
 *
 * Es el input de `canResidenteSeeTicket` / `canResidenteSeeCosto`
 * (packages/domain). Vivía duplicado en MeService y VotosService, y esa
 * duplicación es justamente lo que permitió que otros handlers se olvidaran
 * de aplicarlo: centralizarlo hace que agregar el chequeo sea una línea.
 */
export async function loadResidenteCtx(
  tx: TxClient,
  tenantId: string,
  residenteId: string,
): Promise<ResidenteCtx> {
  const vinculos = await tx
    .select({ unidadId: vinculoResidente.unidadId })
    .from(vinculoResidente)
    .where(
      and(
        eq(vinculoResidente.tenantId, tenantId),
        eq(vinculoResidente.residenteId, residenteId),
        eq(vinculoResidente.activo, true),
      ),
    );
  const unidadIds = new Set(vinculos.map((v) => v.unidadId));

  let consorcioIds = new Set<string>();
  if (unidadIds.size > 0) {
    const unidades = await tx
      .select({ consorcioId: unidad.consorcioId })
      .from(unidad)
      .where(inArray(unidad.id, Array.from(unidadIds)));
    consorcioIds = new Set(unidades.map((u) => u.consorcioId));
  }

  return { residenteId, consorcioIds, unidadIds };
}
