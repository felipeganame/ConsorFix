#!/usr/bin/env node
/**
 * Gate de `pnpm audit` para CI (RNF-04).
 *
 * `pnpm audit --prod --audit-level=high` a secas es inusable en este monorepo:
 * la mayor parte de los hallazgos vienen del toolchain de build de Expo
 * (`expo-cli`, `metro`, `@react-native-community/cli`), que no se despliega ni
 * se embebe en el bundle de la app. Fallar por eso obliga a un upgrade de Expo
 * SDK en cualquier PR no relacionado, y el resultado predecible es que el job
 * queda rojo para siempre y nadie lo mira — que es exactamente donde estaba.
 *
 * Este script mantiene el gate donde importa: **la superficie que corre en
 * producción** (apps/api, apps/worker, packages/*). Los hallazgos que sólo
 * afectan a apps/mobile se reportan como informativos, no bloquean.
 *
 * Las excepciones del backend van en ALLOWLIST, cada una con su motivo. Un
 * hallazgo nuevo en el backend rompe el build; eso es el punto.
 */
const { execFileSync } = require('node:child_process');

/**
 * Advisories del backend aceptadas a conciencia. Revisar en cada iteración de
 * hardening (Fase 6.2 del plan) — no es una lista para que crezca sola.
 */
const ALLOWLIST = {
  'GHSA-r5fr-rjxr-66jc': {
    pkg: 'lodash',
    motivo:
      'Code injection via _.template. No hay versión parcheada publicada ' +
      '(el advisory pide >=4.18.0 y lodash está discontinuado en 4.17.21). ' +
      'Llega por @nestjs/config, que usa lodash para get/set de config, no ' +
      '_.template, y nunca con input del usuario. Sin fix disponible upstream.',
  },
  // RESUELTA el 2026-08-17: drizzle-orm subió a ^0.45.2, que es la versión
  // parcheada de GHSA-gpj5-g38j-94v9 (SQL injection por identificadores mal
  // escapados). El upgrade no requirió cambios de código y las 47 pruebas
  // siguen pasando. Se deja el registro acá porque era la deuda de seguridad
  // más seria del backend.
};

const BLOQUEANTES = new Set(['high', 'critical']);

function runAudit() {
  try {
    // Sale con código != 0 cuando encuentra vulnerabilidades: eso no es un
    // error de ejecución, así que capturamos stdout en ambos casos.
    return execFileSync('pnpm', ['audit', '--prod', '--json'], {
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch (err) {
    if (err.stdout) return err.stdout;
    throw err;
  }
}

function esDeMobile(path) {
  return path.startsWith('apps/mobile');
}

function main() {
  const raw = runAudit();
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    console.error('[audit] no pude parsear la salida de pnpm audit --json:');
    console.error(raw.slice(0, 2000));
    process.exit(1);
  }

  const advisories = Object.values(parsed.advisories || {});
  const bloqueantes = [];
  const permitidas = [];
  const soloMobile = [];

  for (const a of advisories) {
    if (!BLOQUEANTES.has(a.severity)) continue;

    const paths = (a.findings || []).flatMap((f) => f.paths || []);
    const pathsBackend = paths.filter((p) => !esDeMobile(p));
    const ghsa = a.github_advisory_id;
    const item = { ghsa, sev: a.severity, pkg: a.module_name, title: a.title, paths, pathsBackend };

    if (pathsBackend.length === 0) {
      soloMobile.push(item);
    } else if (ALLOWLIST[ghsa]) {
      permitidas.push(item);
    } else {
      bloqueantes.push(item);
    }
  }

  if (soloMobile.length) {
    console.log(
      `\n[audit] ${soloMobile.length} advisories high/critical sólo en el toolchain de apps/mobile ` +
        '(no se despliega — informativo, se resuelven con el upgrade de Expo SDK):',
    );
    const porPkg = {};
    for (const i of soloMobile) porPkg[i.pkg] = (porPkg[i.pkg] || 0) + 1;
    for (const [pkg, n] of Object.entries(porPkg).sort((a, b) => b[1] - a[1])) {
      console.log(`  - ${pkg} (${n})`);
    }
  }

  if (permitidas.length) {
    console.log(`\n[audit] ${permitidas.length} advisories del backend en la ALLOWLIST:`);
    for (const i of permitidas) {
      console.log(`  - ${i.sev.toUpperCase()} ${i.pkg} ${i.ghsa}: ${i.title}`);
      console.log(`    motivo: ${ALLOWLIST[i.ghsa].motivo}`);
    }
  }

  // Una allowlist que menciona advisories que ya no aparecen es una allowlist
  // que quedó vieja: avisamos para poder limpiarla.
  const vistas = new Set(permitidas.map((i) => i.ghsa));
  const obsoletas = Object.keys(ALLOWLIST).filter((g) => !vistas.has(g));
  if (obsoletas.length) {
    console.log(
      `\n[audit] entradas de ALLOWLIST que ya no aplican (limpiar en scripts/audit-ci.cjs): ${obsoletas.join(', ')}`,
    );
  }

  if (bloqueantes.length) {
    console.error(
      `\n[audit] ✗ ${bloqueantes.length} advisories high/critical afectan la superficie de producción:`,
    );
    for (const i of bloqueantes) {
      console.error(`\n  ${i.sev.toUpperCase()} ${i.pkg} — ${i.title}`);
      console.error(`    ${i.ghsa}`);
      for (const p of i.pathsBackend.slice(0, 3)) console.error(`    path: ${p}`);
    }
    console.error(
      '\n  Arreglalo actualizando la dependencia (o con pnpm.overrides en el package.json ' +
        'raíz si es transitiva). Si de verdad no tiene fix, agregala a ALLOWLIST en ' +
        'scripts/audit-ci.cjs con el motivo.',
    );
    process.exit(1);
  }

  console.log('\n[audit] ✓ sin advisories high/critical sin resolver en la superficie de producción.');
}

main();
