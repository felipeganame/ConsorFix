import AsyncStorage from '@react-native-async-storage/async-storage';
import { ApiError, createTicket, type CreateTicketBody } from './api.js';

const QUEUE_KEY = 'cfx.offline-queue';

export interface PendingReport {
  id: string; // client_generated_id (idempotente)
  body: CreateTicketBody;
  attempts: number;
  lastError?: string;
  queuedAt: string;
  /**
   * El servidor rechazó el reporte de forma definitiva (4xx que no es 408 ni
   * 429). Reintentarlo es inútil: la respuesta va a ser la misma siempre.
   *
   * Antes esto no existía y `syncQueue` reencolaba cualquier fallo, así que un
   * reporte rechazado —por ejemplo el de un residente al que le dieron de baja
   * el vínculo mientras estaba sin señal— se quedaba en la cola para siempre y
   * hacía fallar todas las sincronizaciones siguientes. Tampoco se descarta
   * solo: queda visible con el motivo, porque el vecino escribió ese texto y
   * borrárselo en silencio es peor que mostrarle que no entró.
   */
  rechazadoDefinitivamente?: boolean;
}

export async function readQueue(): Promise<PendingReport[]> {
  const raw = await AsyncStorage.getItem(QUEUE_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as PendingReport[];
  } catch {
    return [];
  }
}

async function writeQueue(items: PendingReport[]): Promise<void> {
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(items));
}

export async function enqueue(body: CreateTicketBody): Promise<PendingReport> {
  const items = await readQueue();
  const entry: PendingReport = {
    id: body.client_generated_id,
    body,
    attempts: 0,
    queuedAt: new Date().toISOString(),
  };
  // Idempotente por client_generated_id.
  const existing = items.findIndex((i) => i.id === entry.id);
  if (existing >= 0) items[existing] = entry;
  else items.push(entry);
  await writeQueue(items);
  return entry;
}

export async function removeFromQueue(id: string): Promise<void> {
  const items = await readQueue();
  await writeQueue(items.filter((i) => i.id !== id));
}

/**
 * ¿Vale la pena reintentar este error?
 *
 * Un 4xx significa que el pedido está mal y va a seguir estando mal: falta un
 * vínculo, la unidad no es de ese consorcio, el token venció. Las excepciones
 * son 408 (timeout) y 429 (rate limit), que sí son transitorios. Cualquier otra
 * cosa —error de red, 5xx— se reintenta.
 */
function esDefinitivo(err: unknown): boolean {
  if (!(err instanceof ApiError)) return false;
  if (err.status === 408 || err.status === 429) return false;
  return err.status >= 400 && err.status < 500;
}

export interface ResultadoSync {
  enviados: number;
  reintentables: number;
  rechazados: number;
  pendientes: number;
}

/**
 * Intenta sincronizar la cola completa.
 *
 * Los reportes ya rechazados definitivamente no se vuelven a intentar, así que
 * uno roto no bloquea a los demás. El resto se reintenta: la API deduplica por
 * `client_generated_id`, así que reenviar algo que en realidad sí había entrado
 * no crea un segundo ticket.
 */
export async function syncQueue(): Promise<ResultadoSync> {
  const items = await readQueue();
  if (items.length === 0) return { enviados: 0, reintentables: 0, rechazados: 0, pendientes: 0 };

  let enviados = 0;
  let reintentables = 0;
  const next: PendingReport[] = [];

  for (const item of items) {
    if (item.rechazadoDefinitivamente) {
      next.push(item);
      continue;
    }
    try {
      await createTicket(item.body);
      enviados++;
    } catch (err) {
      const definitivo = esDefinitivo(err);
      if (!definitivo) reintentables++;
      next.push({
        ...item,
        attempts: item.attempts + 1,
        lastError: (err as Error).message,
        ...(definitivo ? { rechazadoDefinitivamente: true } : {}),
      });
    }
  }

  await writeQueue(next);
  return {
    enviados,
    reintentables,
    rechazados: next.filter((i) => i.rechazadoDefinitivamente).length,
    pendientes: next.length,
  };
}

/** Descarta un reporte que el servidor rechazó y el vecino decidió soltar. */
export async function descartar(id: string): Promise<void> {
  await removeFromQueue(id);
}

export async function clearQueue(): Promise<void> {
  await AsyncStorage.removeItem(QUEUE_KEY);
}
