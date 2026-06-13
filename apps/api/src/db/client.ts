import { drizzle } from 'drizzle-orm/node-postgres';
import { sql } from 'drizzle-orm';
import pg from 'pg';
import * as schema from './schema/index.js';

const { Pool } = pg;

// Application pool — runs as a NON-owner role; RLS policies apply.
// Every tenant-scoped query MUST be wrapped in `withTenant()` so
// `app.tenant_id` is set in the transaction.
const appPool = new Pool({ connectionString: process.env.DATABASE_URL });
appPool.on('connect', (c) => { c.on('error', () => {/* surfaced by callers */}); });
export const db = drizzle(appPool, { schema });

// Owner / system pool — runs as the table owner role, BYPASSES RLS.
// Use only for trusted operations that legitimately need cross-tenant access:
//   * authentication (login by email — needs to find admin before tenant is known)
//   * migrations & maintenance jobs
//   * webhook intake before tenant routing
// NEVER expose this pool to request handlers that should be tenant-scoped.
const ownerPool = new Pool({
  connectionString: process.env.DATABASE_OWNER_URL ?? process.env.DATABASE_URL,
});
ownerPool.on('connect', (c) => { c.on('error', () => {/* surfaced */}); });
export const systemDb = drizzle(ownerPool, { schema });

export type TxClient = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Runs `fn` inside a transaction with `app.tenant_id` set for RLS.
 * Every code path that touches tenant-scoped tables MUST go through this.
 */
export async function withTenant<T>(tenantId: string, fn: (tx: TxClient) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT set_config('app.tenant_id', ${tenantId}, true)`);
    return fn(tx);
  });
}
