#!/usr/bin/env node
// Dev seeds. Idempotent: safe to re-run.
const { Client } = require('pg');
const argon2 = require('argon2');

async function findOrInsert(client, selectSql, selectParams, insertSql, insertParams) {
  const r = await client.query(selectSql, selectParams);
  if (r.rows[0]) return r.rows[0];
  const ins = await client.query(insertSql, insertParams);
  return ins.rows[0];
}

async function ensure(client, sql, params) {
  await client.query(sql, params);
}

async function main() {
  const url = process.env.DATABASE_OWNER_URL;
  if (!url) { console.error('[seed] DATABASE_OWNER_URL not set'); process.exit(1); }
  const client = new Client({ connectionString: url });
  await client.connect();

  try {
    const tenant = await findOrInsert(client,
      `SELECT id FROM tenant WHERE nombre=$1 LIMIT 1`, ['Administración Demo'],
      `INSERT INTO tenant (nombre, plan) VALUES ($1, 'basico') RETURNING id`, ['Administración Demo'],
    );

    const adminHash = await argon2.hash('admin123', { type: argon2.argon2id });
    const superHash = await argon2.hash('super123', { type: argon2.argon2id });
    const residHash = await argon2.hash('resi123', { type: argon2.argon2id });

    await ensure(client,
      `INSERT INTO usuario_admin (tenant_id, email, password_hash, rol, nombre)
       VALUES (NULL, $1, $2, 'SUPER_ADMIN', 'Super Demo')
       ON CONFLICT (email) DO NOTHING`,
      ['super@consorciofix.dev', superHash],
    );
    await ensure(client,
      `INSERT INTO usuario_admin (tenant_id, email, password_hash, rol, nombre)
       VALUES ($1, $2, $3, 'ADMIN', 'Admin Demo')
       ON CONFLICT (email) DO NOTHING`,
      [tenant.id, 'admin@consorciofix.dev', adminHash],
    );

    const cons1 = await findOrInsert(client,
      `SELECT id FROM consorcio WHERE tenant_id=$1 AND nombre=$2 LIMIT 1`,
      [tenant.id, 'Edificio Belgrano 1234'],
      `INSERT INTO consorcio (tenant_id, nombre, tipo, direccion)
       VALUES ($1, $2, 'EDIFICIO', 'Belgrano 1234, CABA') RETURNING id`,
      [tenant.id, 'Edificio Belgrano 1234'],
    );
    const cons2 = await findOrInsert(client,
      `SELECT id FROM consorcio WHERE tenant_id=$1 AND nombre=$2 LIMIT 1`,
      [tenant.id, 'Barrio Cerrado Los Alamos'],
      `INSERT INTO consorcio (tenant_id, nombre, tipo, direccion)
       VALUES ($1, $2, 'BARRIO', 'Ruta 8 Km 50') RETURNING id`,
      [tenant.id, 'Barrio Cerrado Los Alamos'],
    );

    const u4A = await findOrInsert(client,
      `SELECT id FROM unidad WHERE consorcio_id=$1 AND etiqueta=$2 LIMIT 1`,
      [cons1.id, '4A'],
      `INSERT INTO unidad (tenant_id, consorcio_id, etiqueta) VALUES ($1, $2, $3) RETURNING id`,
      [tenant.id, cons1.id, '4A'],
    );
    await findOrInsert(client,
      `SELECT id FROM unidad WHERE consorcio_id=$1 AND etiqueta=$2 LIMIT 1`,
      [cons1.id, '4B'],
      `INSERT INTO unidad (tenant_id, consorcio_id, etiqueta) VALUES ($1, $2, $3) RETURNING id`,
      [tenant.id, cons1.id, '4B'],
    );
    await findOrInsert(client,
      `SELECT id FROM unidad WHERE consorcio_id=$1 AND etiqueta=$2 LIMIT 1`,
      [cons2.id, 'Lote 12'],
      `INSERT INTO unidad (tenant_id, consorcio_id, etiqueta) VALUES ($1, $2, $3) RETURNING id`,
      [tenant.id, cons2.id, 'Lote 12'],
    );

    const propi = await findOrInsert(client,
      `SELECT id FROM residente WHERE tenant_id=$1 AND telefono_e164=$2 LIMIT 1`,
      [tenant.id, '+5491100000001'],
      `INSERT INTO residente (tenant_id, nombre, telefono_e164, email, password_hash)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [tenant.id, 'Pedro Propietario', '+5491100000001', 'propi@consorciofix.dev', residHash],
    );
    const inqui = await findOrInsert(client,
      `SELECT id FROM residente WHERE tenant_id=$1 AND telefono_e164=$2 LIMIT 1`,
      [tenant.id, '+5491100000002'],
      `INSERT INTO residente (tenant_id, nombre, telefono_e164, email, password_hash)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [tenant.id, 'Inés Inquilina', '+5491100000002', 'inqui@consorciofix.dev', residHash],
    );

    await ensure(client,
      `INSERT INTO vinculo_residente (tenant_id, residente_id, unidad_id, rol)
       VALUES ($1, $2, $3, 'PROPIETARIO') ON CONFLICT DO NOTHING`,
      [tenant.id, propi.id, u4A.id],
    );
    await ensure(client,
      `INSERT INTO vinculo_residente (tenant_id, residente_id, unidad_id, rol, creado_por_id)
       VALUES ($1, $2, $3, 'INQUILINO', $4) ON CONFLICT DO NOTHING`,
      [tenant.id, inqui.id, u4A.id, propi.id],
    );

    // Propi también es propietario en el barrio cerrado → habilita flujo multi-consorcio del bot.
    const lote12 = await findOrInsert(client,
      `SELECT id FROM unidad WHERE consorcio_id=$1 AND etiqueta=$2 LIMIT 1`,
      [cons2.id, 'Lote 12'],
      `INSERT INTO unidad (tenant_id, consorcio_id, etiqueta) VALUES ($1, $2, $3) RETURNING id`,
      [tenant.id, cons2.id, 'Lote 12'],
    );
    await ensure(client,
      `INSERT INTO vinculo_residente (tenant_id, residente_id, unidad_id, rol)
       VALUES ($1, $2, $3, 'PROPIETARIO') ON CONFLICT DO NOTHING`,
      [tenant.id, propi.id, lote12.id],
    );

    const categorias = [
      ['Plomería', false], ['Electricidad', false], ['Ascensor', false],
      ['Limpieza', false], ['Seguridad', false], ['Ruidos', true],
      ['Estacionamiento', true], ['Mascotas', true],
    ];
    for (const cons of [cons1, cons2]) {
      for (const [nombre, esConducta] of categorias) {
        await ensure(client,
          `INSERT INTO categoria (tenant_id, consorcio_id, nombre, es_conducta)
           VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING`,
          [tenant.id, cons.id, nombre, esConducta],
        );
      }
    }

    console.log('[seed] done');
    console.log('  super@consorciofix.dev / super123    (SUPER_ADMIN)');
    console.log('  admin@consorciofix.dev / admin123    (ADMIN, tenant demo)');
    console.log('  propi@consorciofix.dev / resi123     (RESIDENTE, propietario unidad 4A)');
    console.log('  inqui@consorciofix.dev / resi123     (RESIDENTE, inquilino unidad 4A)');
  } finally {
    await client.end();
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
