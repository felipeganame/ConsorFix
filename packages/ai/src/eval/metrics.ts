/**
 * Métricas de clasificación multiclase.
 *
 * Se calculan por tarea (origen / categoría / urgencia) porque los criterios
 * de salida son distintos para cada una (docs/05 §Fase 3 y gap G4 de docs/01):
 * origen ≥85 % de accuracy, categoría ≥90 % top-1.
 *
 * Sin dependencias: es código de tesis y conviene que el cálculo sea auditable
 * a ojo por el tribunal, no delegado a una librería.
 */

export interface ClassMetrics {
  clase: string;
  soporte: number; // casos reales de esta clase (TP + FN)
  predichos: number; // veces que el modelo predijo esta clase (TP + FP)
  tp: number;
  fp: number;
  fn: number;
  precision: number;
  recall: number;
  f1: number;
}

export interface TaskMetrics {
  tarea: string;
  total: number;
  aciertos: number;
  accuracy: number;
  macroF1: number;
  microF1: number; // == accuracy en multiclase de etiqueta única; se reporta igual
  porClase: ClassMetrics[];
  matrizConfusion: ConfusionMatrix;
}

export interface ConfusionMatrix {
  clases: string[];
  /** filas = real, columnas = predicho */
  filas: number[][];
}

export interface Par {
  esperado: string;
  obtenido: string | null; // null = el modelo no devolvió nada utilizable
}

const NO_PREDICHO = '(sin respuesta)';

function safeDiv(a: number, b: number): number {
  return b === 0 ? 0 : a / b;
}

export function computeTaskMetrics(tarea: string, pares: Par[]): TaskMetrics {
  const reales = pares.map((p) => p.esperado);
  const predichos = pares.map((p) => p.obtenido ?? NO_PREDICHO);

  // El universo de clases incluye las predichas aunque no sean válidas: si el
  // modelo inventa una etiqueta hay que verla en la matriz, no esconderla.
  const clases = Array.from(new Set([...reales, ...predichos])).sort();
  const idx = new Map(clases.map((c, i) => [c, i]));

  const filas = clases.map(() => clases.map(() => 0));
  for (let i = 0; i < pares.length; i++) {
    filas[idx.get(reales[i]!)!]![idx.get(predichos[i]!)!]!++;
  }

  const porClase: ClassMetrics[] = clases.map((clase) => {
    const i = idx.get(clase)!;
    const tp = filas[i]![i]!;
    const fn = filas[i]!.reduce((s, v) => s + v, 0) - tp;
    const fp = filas.reduce((s, fila) => s + fila[i]!, 0) - tp;
    const precision = safeDiv(tp, tp + fp);
    const recall = safeDiv(tp, tp + fn);
    return {
      clase,
      soporte: tp + fn,
      predichos: tp + fp,
      tp,
      fp,
      fn,
      precision,
      recall,
      f1: safeDiv(2 * precision * recall, precision + recall),
    };
  });

  const aciertos = pares.filter((p) => p.obtenido === p.esperado).length;
  const accuracy = safeDiv(aciertos, pares.length);

  // Macro-F1 promedia solo sobre clases con soporte real: incluir clases que
  // el modelo alucinó (soporte 0) hundiría la métrica de forma engañosa.
  const conSoporte = porClase.filter((c) => c.soporte > 0);
  const macroF1 = safeDiv(
    conSoporte.reduce((s, c) => s + c.f1, 0),
    conSoporte.length,
  );

  return {
    tarea,
    total: pares.length,
    aciertos,
    accuracy,
    macroF1,
    microF1: accuracy,
    porClase,
    matrizConfusion: { clases, filas },
  };
}

export function pct(x: number): string {
  return `${(x * 100).toFixed(1)}%`;
}

/** Matriz de confusión en texto plano, lista para pegar en el informe. */
export function renderConfusion(m: ConfusionMatrix): string {
  const etiqueta = (s: string) => s.slice(0, 12).padEnd(12);
  const celda = (n: number) => String(n).padStart(6);
  const cabecera = `${' '.repeat(14)}${m.clases.map((c) => c.slice(0, 6).padStart(6)).join('')}   ← predicho`;
  const cuerpo = m.clases
    .map((c, i) => `  ${etiqueta(c)}${m.filas[i]!.map(celda).join('')}`)
    .join('\n');
  return `${cabecera}\n${cuerpo}\n  ↑ real`;
}

export function renderTask(m: TaskMetrics): string {
  const filas = m.porClase
    .filter((c) => c.soporte > 0 || c.predichos > 0)
    .map(
      (c) =>
        `    ${c.clase.padEnd(14)} n=${String(c.soporte).padStart(4)}  P=${pct(c.precision).padStart(6)}  R=${pct(c.recall).padStart(6)}  F1=${pct(c.f1).padStart(6)}`,
    )
    .join('\n');
  return [
    `  ${m.tarea}: accuracy ${pct(m.accuracy)} (${m.aciertos}/${m.total})   macro-F1 ${pct(m.macroF1)}`,
    filas,
    '',
    renderConfusion(m.matrizConfusion),
  ].join('\n');
}
