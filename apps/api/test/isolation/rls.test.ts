import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, systemDb, withTenant } from '../../src/db/client.js';
import {
  consorcio,
  tenant as tenantTable,
  ticket,
  unidad,
} from '../../src/db/schema/index.js';

// Crea un par de tenants aislados (prefijo único por run) para no colisionar
// con seeds existentes ni entre re-runs.
const PREFIX = `iso_${Date.now()}_`;

let tenantA: { id: string };
let tenantB: { id: string };
let consA: { id: string };
let consB: { id: string };
let unidA: { id: string };
let unidB: { id: string };

beforeAll(async () => {
  tenantA = (await systemDb
    .insert(tenantTable)
    .values({ nombre: `${PREFIX}A`, plan: 'basico' })
    .returning())[0]!;
  tenantB = (await systemDb
    .insert(tenantTable)
    .values({ nombre: `${PREFIX}B`, plan: 'basico' })
    .returning())[0]!;
  consA = (await systemDb
    .insert(consorcio)
    .values({ tenantId: tenantA.id, nombre: `${PREFIX}cons-A`, tipo: 'EDIFICIO' })
    .returning())[0]!;
  consB = (await systemDb
    .insert(consorcio)
    .values({ tenantId: tenantB.id, nombre: `${PREFIX}cons-B`, tipo: 'EDIFICIO' })
    .returning())[0]!;
  unidA = (await systemDb
    .insert(unidad)
    .values({ tenantId: tenantA.id, consorcioId: consA.id, etiqueta: '1A' })
    .returning())[0]!;
  unidB = (await systemDb
    .insert(unidad)
    .values({ tenantId: tenantB.id, consorcioId: consB.id, etiqueta: '1A' })
    .returning())[0]!;
  // Tickets en cada tenant.
  await systemDb.insert(ticket).values({
    tenantId: tenantA.id,
    consorcioId: consA.id,
    unidadId: unidA.id,
    tipo: 'INFRAESTRUCTURA',
    urgencia: 'MEDIA',
    titulo: 'A-ticket',
    descripcionNormalizada: 'desde tenant A',
  });
  await systemDb.insert(ticket).values({
    tenantId: tenantB.id,
    consorcioId: consB.id,
    unidadId: unidB.id,
    tipo: 'INFRAESTRUCTURA',
    urgencia: 'MEDIA',
    titulo: 'B-ticket',
    descripcionNormalizada: 'desde tenant B',
  });
});

afterAll(async () => {
  // Cascade limpia todo lo creado.
  await systemDb.delete(tenantTable).where(eq(tenantTable.id, tenantA.id));
  await systemDb.delete(tenantTable).where(eq(tenantTable.id, tenantB.id));
});

describe('multi-tenant isolation (RLS)', () => {
  it('withTenant(A) ONLY sees tenant A data', async () => {
    const rows = await withTenant(tenantA.id, async (tx) => tx.select().from(ticket));
    expect(rows.length).toBe(1);
    expect(rows[0]!.titulo).toBe('A-ticket');
  });

  it('withTenant(B) ONLY sees tenant B data', async () => {
    const rows = await withTenant(tenantB.id, async (tx) => tx.select().from(ticket));
    expect(rows.length).toBe(1);
    expect(rows[0]!.titulo).toBe('B-ticket');
  });

  it('withTenant(A) returns zero rows when filtering by tenant B id', async () => {
    const rows = await withTenant(tenantA.id, async (tx) =>
      tx.select().from(ticket).where(eq(ticket.tenantId, tenantB.id)),
    );
    expect(rows.length).toBe(0);
  });

  it('withTenant(A) cannot SELECT tenant B consorcio even by id', async () => {
    const rows = await withTenant(tenantA.id, async (tx) =>
      tx.select().from(consorcio).where(eq(consorcio.id, consB.id)),
    );
    expect(rows.length).toBe(0);
  });

  it('withTenant(A) cannot UPDATE tenant B ticket (0 rows affected)', async () => {
    const updated = await withTenant(tenantA.id, async (tx) =>
      tx
        .update(ticket)
        .set({ titulo: 'PWNED' })
        .where(eq(ticket.tenantId, tenantB.id))
        .returning(),
    );
    expect(updated.length).toBe(0);
    // confirm via systemDb (bypasses RLS)
    const after = await systemDb.select().from(ticket).where(eq(ticket.tenantId, tenantB.id));
    expect(after[0]!.titulo).toBe('B-ticket');
  });

  it('withTenant(A) cannot DELETE tenant B data', async () => {
    const deleted = await withTenant(tenantA.id, async (tx) =>
      tx.delete(ticket).where(eq(ticket.tenantId, tenantB.id)).returning(),
    );
    expect(deleted.length).toBe(0);
  });

  it('withTenant resets between calls (no session leak)', async () => {
    const a = await withTenant(tenantA.id, async (tx) => tx.select().from(ticket));
    expect(a.length).toBe(1);
    const b = await withTenant(tenantB.id, async (tx) => tx.select().from(ticket));
    expect(b.length).toBe(1);
    expect(a[0]!.titulo).not.toBe(b[0]!.titulo);
  });

  it('withTenant does NOT permit cross-tenant INSERT (CHECK fails RLS)', async () => {
    await expect(
      withTenant(tenantA.id, async (tx) =>
        tx.insert(ticket).values({
          tenantId: tenantB.id, // ojo: tenant ajeno
          consorcioId: consB.id,
          unidadId: unidB.id,
          tipo: 'INFRAESTRUCTURA',
          urgencia: 'MEDIA',
          titulo: 'cross-tenant-attempt',
          descripcionNormalizada: 'no',
        }),
      ),
    ).rejects.toThrow();
  });
});
