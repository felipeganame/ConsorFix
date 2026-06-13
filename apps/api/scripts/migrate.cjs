#!/usr/bin/env node
// Runs raw SQL migrations from ./drizzle/migrations in lexical order, as DATABASE_OWNER_URL.
// Records applied migrations in `_migrations` (owned by the owner role).
const { readdirSync, readFileSync } = require('node:fs');
const { join } = require('node:path');
const { Client } = require('pg');

async function main() {
  const url = process.env.DATABASE_OWNER_URL;
  if (!url) {
    console.error('[migrate] DATABASE_OWNER_URL not set');
    process.exit(1);
  }
  const client = new Client({ connectionString: url });
  await client.connect();
  await client.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  const dir = join(__dirname, '..', 'drizzle', 'migrations');
  const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  for (const f of files) {
    const { rows } = await client.query('SELECT 1 FROM _migrations WHERE id = $1', [f]);
    if (rows.length) { console.log(`[migrate] skip ${f} (already applied)`); continue; }
    const sql = readFileSync(join(dir, f), 'utf8');
    console.log(`[migrate] applying ${f}`);
    await client.query(sql);
    await client.query('INSERT INTO _migrations(id) VALUES ($1)', [f]);
  }
  await client.end();
  console.log('[migrate] done');
}

main().catch((err) => { console.error(err); process.exit(1); });
