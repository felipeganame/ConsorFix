import AsyncStorage from '@react-native-async-storage/async-storage';
import { createTicket, type CreateTicketBody } from './api.js';

const QUEUE_KEY = 'cfx.offline-queue';

export interface PendingReport {
  id: string; // client_generated_id (idempotente)
  body: CreateTicketBody;
  attempts: number;
  lastError?: string;
  queuedAt: string;
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
 * Intenta sincronizar todo el queue. Cada éxito quita del queue.
 * Cada fallo incrementa attempts y persiste lastError.
 * Devuelve resumen para mostrar al usuario.
 */
export async function syncQueue(): Promise<{ synced: number; failed: number; remaining: number }> {
  const items = await readQueue();
  if (items.length === 0) return { synced: 0, failed: 0, remaining: 0 };

  let synced = 0;
  let failed = 0;
  const next: PendingReport[] = [];

  for (const item of items) {
    try {
      await createTicket(item.body);
      synced++;
    } catch (err) {
      failed++;
      next.push({
        ...item,
        attempts: item.attempts + 1,
        lastError: (err as Error).message,
      });
    }
  }

  await writeQueue(next);
  return { synced, failed, remaining: next.length };
}

export async function clearQueue(): Promise<void> {
  await AsyncStorage.removeItem(QUEUE_KEY);
}
