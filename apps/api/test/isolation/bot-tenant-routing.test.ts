import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { systemDb } from '../../src/db/client.js';
import { residente, tenant as tenantTable } from '../../src/db/schema/index.js';

/**
 * Ruteo del bot cuando un teléfono figura en más de una administración.
 *
 * Va en la suite de aislamiento y no en la de integración porque es la regla 1:
 * el ruteo por teléfono es el único punto del sistema donde una consulta es
 * legítimamente cross-tenant (todavía no se sabe el tenant), y por lo tanto el
 * único donde RLS no puede protegernos. La constraint es
 * `UNIQUE(tenant_id, telefono_e164)`, así que el mismo número en dos tenants es
 * un estado VÁLIDO de la base, no una corrupción.
 *
 * Antes, `findResidente` hacía `LIMIT 1` sin orden determinístico: el bot
 * elegía una administración a la suerte y le imputaba el reporte.
 */
const PREFIX = `route_${Date.now()}_`;
const TELEFONO = `+5491${String(Date.now()).slice(-8)}`;

let tenantA: { id: string };
let tenantB: { id: string };

beforeAll(async () => {
  tenantA = (await systemDb.insert(tenantTable).values({ nombre: `${PREFIX}A`, plan: 'basico' }).returning())[0]!;
  tenantB = (await systemDb.insert(tenantTable).values({ nombre: `${PREFIX}B`, plan: 'basico' }).returning())[0]!;
});

afterAll(async () => {
  await systemDb.delete(tenantTable).where(eq(tenantTable.id, tenantA.id));
  await systemDb.delete(tenantTable).where(eq(tenantTable.id, tenantB.id));
});

describe('ruteo por teléfono entre tenants (regla 1)', () => {
  it('la base permite el mismo teléfono en dos administraciones', async () => {
    // Si esto fallara, la premisa del bug no existiría y el resto sobra.
    await systemDb.insert(residente).values({
      tenantId: tenantA.id,
      nombre: `${PREFIX}en-A`,
      telefonoE164: TELEFONO,
    });
    await systemDb.insert(residente).values({
      tenantId: tenantB.id,
      nombre: `${PREFIX}en-B`,
      telefonoE164: TELEFONO,
    });

    const rows = await systemDb
      .select({ id: residente.id, tenantId: residente.tenantId })
      .from(residente)
      .where(eq(residente.telefonoE164, TELEFONO));

    expect(rows).toHaveLength(2);
    expect(new Set(rows.map((r) => r.tenantId))).toEqual(new Set([tenantA.id, tenantB.id]));
  });

  it('el mismo teléfono NO se puede repetir dentro de un tenant', async () => {
    await expect(
      systemDb.insert(residente).values({
        tenantId: tenantA.id,
        nombre: `${PREFIX}duplicado`,
        telefonoE164: TELEFONO,
      }),
    ).rejects.toThrow();
  });

  it('un LIMIT 1 sin tenant devuelve una administración arbitraria', async () => {
    // Documenta el bug: la consulta que hacía el bot no puede distinguir, así
    // que resolver por "el primero que venga" es elegir un tenant a la suerte.
    const uno = await systemDb
      .select({ tenantId: residente.tenantId })
      .from(residente)
      .where(eq(residente.telefonoE164, TELEFONO))
      .limit(1);

    expect(uno).toHaveLength(1);
    // No se puede afirmar CUÁL: ese es exactamente el problema.
    expect([tenantA.id, tenantB.id]).toContain(uno[0]!.tenantId);
  });
});
