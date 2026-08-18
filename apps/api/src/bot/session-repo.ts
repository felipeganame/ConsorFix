import { eq } from 'drizzle-orm';
import { systemDb } from '../db/client.js';
import { sesionBot } from '../db/schema/index.js';

/**
 * Conversational state persisted per phone (NOT tenant-scoped: pre-routing).
 * `estado_flujo` is a free-form jsonb blob shaped by the bot flow steps.
 */
export interface SessionState {
  step?: 'pick_consorcio' | 'confirm_dedup' | 'confirm_reporte';
  pendingText?: string;
  options?: Array<{ consorcioId: string; unidadId: string; nombre: string }>;
  // For 'confirm_dedup' step:
  dedupCandidate?: {
    ticketId: string;
    titulo: string;
    consorcioId: string;
    unidadId: string | null;
    similarity: number;
  };
  pendingTicketInputs?: {
    consorcioId: string;
    unidadId: string | null;
    classifiedTitulo: string;
    classifiedDescripcion: string;
    classifiedCategoria: string;
    classifiedOrigen: 'UNIDAD' | 'ESPACIO_COMUN';
    classifiedUrgencia: 'CRITICA' | 'ALTA' | 'MEDIA' | 'BAJA';
    // Metadatos del clasificador. Van en la sesión porque el ticket de la rama
    // "no es duplicado" se crea en otro request, y sin esto esa rama quedaba
    // sin registro en `clasificacion_ia` — un agujero silencioso en el dataset.
    classifiedTipo: 'INFRAESTRUCTURA' | 'CONDUCTA';
    classifiedConfianza: number;
    classifiedModelo: string;
    classifiedPromptVersion: string;
    classifiedUbicacion?: string;
    /**
     * Telemetría del clasificador (RF-C07). Va en la sesión porque el ticket se
     * crea en OTRO request —el de la confirmación—, y sin esto el costo quedaba
     * NULL para todos los tickets del bot.
     */
    classifiedUso?: {
      tokensIn?: number;
      tokensOut?: number;
      costoUsd?: number;
      latenciaMs?: number;
      cacheHit?: boolean;
    };
    /**
     * Adjunto pendiente (RF-B09). Los bytes NO se guardan en la sesión: se
     * suben al storage antes de pedir la confirmación y acá viaja solo la
     * referencia. Guardar megabytes en un jsonb de sesión sería un problema
     * distinto, y las URLs del proveedor expiran en minutos, así que el momento
     * de subir es cuando llegan.
     */
    mediaSubida?: {
      tipo: 'FOTO' | 'AUDIO';
      storageUrl: string;
      proveedorId: string;
      mimeType: string;
      sizeBytes: number;
    };
    embedding: number[];
  };
}

const TTL_MIN = 15;

function expiresAt(): Date {
  return new Date(Date.now() + TTL_MIN * 60_000);
}

export async function getActiveSession(phone: string): Promise<{ id: string; state: SessionState } | null> {
  const rows = await systemDb
    .select({ id: sesionBot.id, state: sesionBot.estadoFlujo, expira: sesionBot.expiraAt })
    .from(sesionBot)
    .where(eq(sesionBot.telefonoE164, phone))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  if (row.expira.getTime() < Date.now()) {
    await systemDb.delete(sesionBot).where(eq(sesionBot.id, row.id));
    return null;
  }
  return { id: row.id, state: (row.state as SessionState) ?? {} };
}

export async function upsertSession(phone: string, state: SessionState): Promise<void> {
  const existing = await systemDb
    .select({ id: sesionBot.id })
    .from(sesionBot)
    .where(eq(sesionBot.telefonoE164, phone))
    .limit(1);
  if (existing[0]) {
    await systemDb
      .update(sesionBot)
      .set({ estadoFlujo: state, expiraAt: expiresAt() })
      .where(eq(sesionBot.id, existing[0].id));
    return;
  }
  await systemDb
    .insert(sesionBot)
    .values({ telefonoE164: phone, estadoFlujo: state, expiraAt: expiresAt() });
}

export async function clearSession(phone: string): Promise<void> {
  await systemDb.delete(sesionBot).where(eq(sesionBot.telefonoE164, phone));
}
