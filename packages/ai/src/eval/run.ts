#!/usr/bin/env node
/**
 * `pnpm ai:eval` — evalúa el clasificador contra el dataset etiquetado.
 * Implementa RF-C06 y la tarea 3.4 del plan.
 *
 * Es lo que hace ejecutable la regla 9 de CLAUDE.md: cambiar un prompt exige
 * correr esto y registrar el resultado en el CHANGELOG del prompt. Hasta ahora
 * el script apuntaba a un archivo inexistente y fallaba con MODULE_NOT_FOUND,
 * así que la regla era inaplicable.
 *
 * Uso:
 *   pnpm ai:eval                            # provider por env (mock si no hay key)
 *   pnpm ai:eval -- --provider openai       # fuerza proveedor
 *   pnpm ai:eval -- --dataset ruta.jsonl --out resultados.json
 *   pnpm ai:eval -- --limit 20              # corrida corta de humo
 *
 * Sale con código 1 si no se alcanzan los umbrales, para poder ponerlo en CI.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { createClassifier } from '../factory.js';
import { CLASSIFIER_PROMPT_VERSION } from '../prompts/classifier-v1.js';
import { loadDataset, resumenDataset, type EvalCase } from './dataset.js';
import { computeTaskMetrics, pct, renderTask, type Par, type TaskMetrics } from './metrics.js';

// Criterios de salida de la Fase 3 (docs/05) y gap G4 (docs/01 §85).
// La urgencia se mide y se reporta, pero los docs no le fijan umbral formal.
const UMBRALES: Record<string, number> = {
  // El tipo decide el circuito entero (anonimato, votos, a quién se acusa), así
  // que equivocarlo es más caro que equivocar una categoría: se le exige más.
  tipo: 0.95,
  origen: 0.85,
  categoria: 0.9,
};

interface Args {
  dataset: string;
  out: string | null;
  limit: number | null;
  concurrency: number;
}

function parseArgs(argv: string[]): Args {
  const get = (flag: string): string | undefined => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  // El paquete compila a CommonJS, así que __dirname existe y apunta a
  // dist/eval. El dataset es dato fuente versionado —no salida de build—, así
  // que se resuelve contra src/ y no se copia a dist.
  const datasetPorDefecto = join(__dirname, '..', '..', 'src', 'eval', 'datasets', 'classifier-v1.jsonl');
  const provider = get('--provider');
  if (provider) process.env['AI_CLASSIFIER_PROVIDER'] = provider;
  const model = get('--model');
  if (model) process.env['AI_CLASSIFIER_MODEL'] = model;

  return {
    dataset: resolve(get('--dataset') ?? datasetPorDefecto),
    out: get('--out') ?? null,
    limit: get('--limit') ? Number(get('--limit')) : null,
    concurrency: Number(get('--concurrency') ?? 4),
  };
}

/** Corre `fn` sobre `items` con paralelismo acotado, preservando el orden. */
async function mapLimit<T, R>(items: T[], limit: number, fn: (t: T, i: number) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      out[i] = await fn(items[i]!, i);
    }
  });
  await Promise.all(workers);
  return out;
}

interface Fallo {
  id: string;
  text: string;
  tarea: string;
  esperado: string;
  obtenido: string | null;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  let casos: EvalCase[] = loadDataset(args.dataset);
  if (args.limit) casos = casos.slice(0, args.limit);

  const classifier = createClassifier();
  const provider = process.env['AI_CLASSIFIER_PROVIDER'] ?? process.env['AI_PROVIDER'] ?? 'mock';

  console.log('');
  console.log('═══ Evaluación del clasificador ═══');
  console.log(`  prompt:   ${CLASSIFIER_PROMPT_VERSION}`);
  console.log(`  provider: ${provider}${provider === 'mock' ? '  ⚠️  sin API key: los números NO son válidos para la tesis' : ''}`);
  console.log(`  dataset:  ${args.dataset}`);
  console.log(resumenDataset(casos));
  console.log('');

  const t0 = Date.now();
  let errores = 0;

  const salidas = await mapLimit(casos, args.concurrency, async (caso) => {
    try {
      return await classifier.classify(caso.text, { promptVersion: CLASSIFIER_PROMPT_VERSION });
    } catch (err) {
      errores++;
      console.error(`  ✗ ${caso.id}: ${(err as Error).message}`);
      return null;
    }
  });
  const elapsedMs = Date.now() - t0;

  const tareas: Array<'tipo' | 'origen' | 'categoria' | 'urgencia'> = ['tipo', 'origen', 'categoria', 'urgencia'];
  const metricas: TaskMetrics[] = [];
  const fallos: Fallo[] = [];

  for (const tarea of tareas) {
    const pares: Par[] = [];
    casos.forEach((caso, i) => {
      const esperado = caso.expected[tarea];
      if (!esperado) return; // el caso no evalúa esta tarea
      const obtenido = (salidas[i]?.[tarea] as string | undefined) ?? null;
      pares.push({ esperado, obtenido });
      if (obtenido !== esperado) {
        fallos.push({ id: caso.id, text: caso.text, tarea, esperado, obtenido });
      }
    });
    if (pares.length > 0) metricas.push(computeTaskMetrics(tarea, pares));
  }

  for (const m of metricas) {
    console.log(renderTask(m));
    console.log('');
  }

  if (fallos.length > 0) {
    console.log(`  ── ${fallos.length} desaciertos (primeros 15) ──`);
    for (const f of fallos.slice(0, 15)) {
      console.log(`    [${f.tarea}] ${f.id}: esperaba ${f.esperado}, dio ${f.obtenido ?? '(nada)'}`);
      console.log(`        "${f.text.slice(0, 92)}"`);
    }
    console.log('');
  }

  // Umbrales
  let ok = true;
  console.log('  ── Criterios de salida ──');
  for (const [tarea, minimo] of Object.entries(UMBRALES)) {
    const m = metricas.find((x) => x.tarea === tarea);
    if (!m) continue;
    const pasa = m.accuracy >= minimo;
    ok &&= pasa;
    console.log(`    ${pasa ? '✅' : '❌'} ${tarea}: ${pct(m.accuracy)} (mínimo ${pct(minimo)})`);
  }
  if (errores > 0) {
    ok = false;
    console.log(`    ❌ ${errores} llamadas fallaron`);
  }
  console.log('');
  console.log(`  ${casos.length} casos en ${(elapsedMs / 1000).toFixed(1)}s (${(elapsedMs / casos.length).toFixed(0)} ms/caso)`);

  if (args.out) {
    const reporte = {
      promptVersion: CLASSIFIER_PROMPT_VERSION,
      provider,
      modelo: salidas.find(Boolean)?.modelo ?? null,
      dataset: args.dataset,
      casos: casos.length,
      elapsedMs,
      errores,
      cumpleUmbrales: ok,
      metricas,
      fallos,
    };
    mkdirSync(dirname(resolve(args.out)), { recursive: true });
    writeFileSync(resolve(args.out), JSON.stringify(reporte, null, 2));
    console.log(`  reporte → ${args.out}`);
  }

  // Fila lista para pegar en el CHANGELOG del prompt (regla 9).
  const fila = metricas
    .map((m) => `${m.tarea} ${pct(m.accuracy)}`)
    .join(' · ');
  console.log('');
  console.log(`  changelog: | ${CLASSIFIER_PROMPT_VERSION} | ${provider} | ${fila} |`);
  console.log('');

  if (!ok) {
    console.error('  No se alcanzaron los criterios de salida.');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
