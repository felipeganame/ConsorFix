/**
 * Tarifas por millón de tokens, en USD (RF-C07).
 *
 * El costo se calcula y se guarda **al momento de la llamada**, no se recalcula
 * después: las tarifas cambian, y aplicar la tarifa de hoy a un histórico daría
 * un número falso justo en el dato que se va a defender en la tesis.
 *
 * Un modelo sin tarifa conocida no rompe nada: se guardan los tokens y el costo
 * queda null. Es mejor un costo faltante que uno inventado.
 *
 * Última revisión: 2026-08-18. Verificar contra la página de precios del
 * proveedor antes de citar estos números en la tesis.
 */
export interface Tarifa {
  /** USD por millón de tokens de entrada. */
  in: number;
  /** USD por millón de tokens de salida. */
  out: number;
}

const TARIFAS: Record<string, Tarifa> = {
  'gpt-4o-mini': { in: 0.15, out: 0.6 },
  'gpt-4o': { in: 2.5, out: 10 },
  'text-embedding-3-small': { in: 0.02, out: 0 },
  'text-embedding-3-large': { in: 0.13, out: 0 },
  'claude-haiku-4-5-20251001': { in: 1, out: 5 },
  'gemini-2.0-flash': { in: 0.1, out: 0.4 },
};

// `whisper-1` NO está en el mapa a propósito: se cobra por minuto de audio, no
// por token. Tenerlo con {in:0,out:0} hacía que calcularCosto devolviera 0 y
// presentara la transcripción como gratis, en vez de undefined ("no sé cuánto
// costó"), que es la política del resto del archivo.

/** Devuelve el costo en USD, o undefined si no hay tarifa para ese modelo. */
export function calcularCosto(
  modelo: string,
  tokensIn: number | undefined,
  tokensOut: number | undefined,
): number | undefined {
  const t = TARIFAS[modelo];
  if (!t) return undefined;
  const entrada = ((tokensIn ?? 0) / 1_000_000) * t.in;
  const salida = ((tokensOut ?? 0) / 1_000_000) * t.out;
  const total = entrada + salida;
  // 6 decimales: una clasificación cuesta del orden de 0,0001 USD, así que
  // redondear a menos la convertiría en cero.
  return Number(total.toFixed(6));
}

export function tarifaConocida(modelo: string): boolean {
  return modelo in TARIFAS;
}
