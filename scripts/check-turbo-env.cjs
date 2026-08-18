#!/usr/bin/env node
/**
 * Verifica que toda variable declarada en `.env.example` esté también en
 * `globalEnv` de `turbo.json`.
 *
 * Turbo 2 usa envMode strict: solo pasa a las tareas las variables declaradas.
 * Una que falte NO da error — simplemente llega `undefined`, y el síntoma
 * aparece lejos del causante. Ya pasó tres veces en este repo: con las vars de
 * IA (el worker no veía la config), con las de Telegram (503 sin explicación) y
 * con las de S3 (la media se descartaba en silencio).
 *
 * Corre en CI para que la cuarta no exista.
 */
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const raiz = join(__dirname, '..');
const ejemplo = readFileSync(join(raiz, '.env.example'), 'utf8');
const turbo = JSON.parse(readFileSync(join(raiz, 'turbo.json'), 'utf8'));
const declaradas = new Set(turbo.globalEnv ?? []);

// Vars que son solo del cliente o del build y no las consume ninguna tarea.
const IGNORAR = new Set(['EXPO_PUBLIC_API_URL']);

const enEjemplo = ejemplo
  .split('\n')
  .map((l) => l.trim())
  .filter((l) => l && !l.startsWith('#'))
  .map((l) => l.split('=')[0].trim())
  .filter((v) => v && !IGNORAR.has(v));

const faltantes = [...new Set(enEjemplo)].filter((v) => !declaradas.has(v));

if (faltantes.length) {
  console.error('\n✗ Variables en .env.example que faltan en globalEnv de turbo.json:\n');
  for (const v of faltantes) console.error(`    ${v}`);
  console.error(
    '\n  Con envMode strict, estas variables llegan como undefined a las tareas y el\n' +
      '  fallo aparece lejos de la causa. Agregalas a globalEnv o a IGNORAR si de\n' +
      '  verdad no las consume ninguna tarea.\n',
  );
  process.exit(1);
}

console.log(`✓ las ${enEjemplo.length} variables de .env.example están declaradas en turbo.json`);
