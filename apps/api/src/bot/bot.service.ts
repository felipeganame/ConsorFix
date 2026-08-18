import { Injectable, Logger } from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';
import {
  CLASSIFIER_PROMPT_VERSION,
  createClassifier,
  createEmbedder,
  createTranscriber,
  createVision,
  VISION_PROMPT_VERSION,
} from '@consorciofix/ai';
import { createWhatsAppProvider, type InboundMessage } from '@consorciofix/messaging';
import { systemDb } from '../db/client.js';
import {
  clasificacionIa,
  consorcio,
  residente,
  ticket,
  ticketEvento,
  unidad,
  vinculoResidente,
  voto,
  webhookEvent,
} from '../db/schema/index.js';
import { findDedupCandidate } from './dedup.js';
import {
  clearSession,
  getActiveSession,
  upsertSession,
  type SessionState,
} from './session-repo.js';

/**
 * Pipeline P1:
 *
 *   webhook → BotService.handle(inbound)
 *
 *   1. Look up residente by phone (cross-tenant).
 *   2. Unregistered → reply "no estás registrado".
 *   3. Multi-consorcio → ask which one (sesion_bot keeps pending text until reply).
 *   4. Single consorcio → classify → embed → dedup search.
 *      4a. Si hay candidato similar (>= threshold): ofrecer voto en lugar de
 *          crear nuevo ticket (RF-B07).
 *      4b. Sin candidato: crear ticket nuevo con embedding.
 *
 * Implements RF-B01..B03, B05 (mock), B06, B07. Audio (B04) llega con
 * la integración real de Whisper.
 */
@Injectable()
export class BotService {
  private readonly log = new Logger(BotService.name);
  private readonly classifier = createClassifier();
  private readonly embedder = createEmbedder();
  private readonly transcriber = createTranscriber();
  private readonly vision = createVision();
  private readonly messaging = createWhatsAppProvider();

  async handle(inbound: InboundMessage): Promise<{ status: string; ticketId?: string }> {
    if (inbound.kind === 'other') {
      await this.reply(inbound.from, 'Formato no soportado. Mandá texto o foto.');
      return { status: 'unsupported-kind' };
    }

    const resi = await this.findResidente(inbound.from);
    if (!resi) {
      await this.reply(inbound.from, 'Hola. Tu número no está registrado. Contactá a tu administración.');
      return { status: 'unregistered' };
    }

    // Sesión activa: ruteo según step.
    const session = await getActiveSession(inbound.from);
    if (session?.state.step === 'pick_consorcio') {
      return this.handleConsorcioChoice(inbound, resi, session.state);
    }
    if (session?.state.step === 'confirm_dedup') {
      return this.handleDedupConfirm(inbound, resi, session.state);
    }

    const consorcios = await this.consorciosDelResidente(resi.id, resi.tenantId);
    if (consorcios.length === 0) {
      await this.reply(inbound.from, 'No tenés consorcios activos. Contactá a tu administración.');
      return { status: 'no-active-consorcios' };
    }

    // Para audio: descargar media + transcribir (RF-B04). Si falla, pedir texto.
    let text = (inbound.text ?? '').trim();
    if (inbound.kind === 'audio') {
      if (!inbound.mediaId) {
        await this.reply(inbound.from, 'No pude recuperar tu audio. Probá escribirlo.');
        return { status: 'audio-no-mediaid' };
      }
      try {
        const dl = await this.messaging.downloadMedia(inbound.mediaId);
        const tr = await this.transcriber.transcribe(dl.bytes, { language: 'es' });
        text = (tr.text ?? '').trim();
        if (text.length === 0) {
          await this.reply(inbound.from, 'No te entendí el audio. ¿Podés escribirlo?');
          return { status: 'audio-empty-transcript' };
        }
      } catch (err) {
        this.log.warn({ err: (err as Error).message }, 'transcription failed');
        await this.reply(inbound.from, 'No pude procesar tu audio. ¿Podés escribirlo?');
        return { status: 'audio-error' };
      }
    } else if (inbound.kind === 'image') {
      if (!inbound.mediaId) {
        await this.reply(inbound.from, 'No pude recuperar tu foto. Probá describir con texto qué pasa.');
        return { status: 'image-no-mediaid' };
      }
      try {
        const dl = await this.messaging.downloadMedia(inbound.mediaId);
        const v = await this.vision.describe(dl.bytes, {
          contentType: dl.contentType,
          promptVersion: VISION_PROMPT_VERSION,
        });
        if (!v.apropiado) {
          await this.reply(inbound.from, 'La foto que mandaste no parece relacionada con un problema del consorcio. Probá mandar otra o describí con texto.');
          return { status: 'image-not-appropriate' };
        }
        // Merge: visión describe lo visible + lo que el usuario escribió.
        const userText = (inbound.text ?? '').trim();
        text = userText.length > 0 ? `${userText}. ${v.descripcion}` : v.descripcion;
      } catch (err) {
        this.log.warn({ err: (err as Error).message }, 'vision failed');
        await this.reply(inbound.from, 'No pude analizar la foto. Probá describir con texto qué pasa.');
        return { status: 'image-error' };
      }
    }
    if (text.length === 0) {
      await this.reply(inbound.from, 'Mensaje vacío. Contame qué pasa.');
      return { status: 'empty' };
    }

    if (consorcios.length > 1) {
      const options = consorcios.slice(0, 9);
      const list = options.map((c, i) => `${i + 1}. ${c.nombre}`).join('\n');
      await upsertSession(inbound.from, {
        step: 'pick_consorcio',
        pendingText: text,
        options: options.map((c) => ({ consorcioId: c.consorcioId, unidadId: c.unidadId, nombre: c.nombre })),
      });
      await this.reply(
        inbound.from,
        `Tenés ${consorcios.length} consorcios. ¿A cuál refiere el reporte?\n${list}\n\nRespondé con el número.`,
      );
      return { status: 'awaiting-consorcio-choice' };
    }

    const choice = consorcios[0]!;
    return this.classifyDedupCreate(inbound, resi, choice.consorcioId, choice.unidadId, text);
  }

  private async handleConsorcioChoice(
    inbound: InboundMessage,
    resi: { id: string; tenantId: string },
    state: SessionState,
  ): Promise<{ status: string; ticketId?: string }> {
    const raw = (inbound.text ?? '').trim();
    const n = Number.parseInt(raw, 10);
    const options = state.options ?? [];
    if (!Number.isInteger(n) || n < 1 || n > options.length) {
      const list = options.map((o, i) => `${i + 1}. ${o.nombre}`).join('\n');
      await this.reply(inbound.from, `No entendí. Respondé con un número del 1 al ${options.length}.\n${list}`);
      return { status: 'consorcio-choice-invalid' };
    }
    const chosen = options[n - 1]!;
    const pendingText = state.pendingText ?? '';
    await clearSession(inbound.from);
    if (!pendingText) {
      await this.reply(inbound.from, `Listo, consorcio ${chosen.nombre}. Contame qué pasa.`);
      return { status: 'consorcio-chosen-no-pending' };
    }
    return this.classifyDedupCreate(inbound, resi, chosen.consorcioId, chosen.unidadId, pendingText);
  }

  private async handleDedupConfirm(
    inbound: InboundMessage,
    resi: { id: string; tenantId: string },
    state: SessionState,
  ): Promise<{ status: string; ticketId?: string }> {
    const raw = (inbound.text ?? '').trim().toLowerCase();
    const yes = /^(s|si|sí|yes|y|1)$/i.test(raw);
    const no = /^(n|no|2)$/i.test(raw);
    if (!yes && !no) {
      await this.reply(inbound.from, 'Respondé Sí para sumar tu voto al reporte existente, o No para crear uno nuevo.');
      return { status: 'dedup-confirm-invalid' };
    }
    const candidate = state.dedupCandidate;
    const inputs = state.pendingTicketInputs;
    if (!candidate || !inputs) {
      await clearSession(inbound.from);
      await this.reply(inbound.from, 'Tu sesión expiró. Volvé a mandar el reporte.');
      return { status: 'dedup-session-corrupt' };
    }

    await clearSession(inbound.from);
    await this.markWebhookProcessed(inbound.wamid);

    if (yes) {
      await this.castVote(resi.tenantId, candidate.ticketId, resi.id);
      await this.reply(
        inbound.from,
        `Sumé tu voto al reporte "${candidate.titulo}" (#${candidate.ticketId.slice(0, 8)}). Te vamos a notificar cuando avance.`,
      );
      return { status: 'voted-existing', ticketId: candidate.ticketId };
    }

    // No: crear ticket nuevo con los inputs ya clasificados.
    const t = await this.createTicket({
      tenantId: resi.tenantId,
      consorcioId: inputs.consorcioId,
      unidadId: inputs.unidadId,
      reportanteId: resi.id,
      tipo: 'INFRAESTRUCTURA',
      urgencia: inputs.classifiedUrgencia,
      origenSugerido: inputs.classifiedOrigen,
      titulo: inputs.classifiedTitulo,
      descripcion: inputs.classifiedDescripcion,
      embedding: inputs.embedding,
      clasificacion: {
        sugerido: {
          titulo: inputs.classifiedTitulo,
          descripcion_normalizada: inputs.classifiedDescripcion,
          categoria: inputs.classifiedCategoria,
          origen: inputs.classifiedOrigen,
          urgencia: inputs.classifiedUrgencia,
          ...(inputs.classifiedUbicacion !== undefined && { ubicacion: inputs.classifiedUbicacion }),
        },
        confianza: inputs.classifiedConfianza,
        modelo: inputs.classifiedModelo,
        promptVersion: inputs.classifiedPromptVersion,
      },
    });
    await this.reply(
      inbound.from,
      `Ok, registré un reporte nuevo (#${t.id.slice(0, 8)}). Categoría: ${inputs.classifiedCategoria}, urgencia: ${inputs.classifiedUrgencia}. El administrador lo va a validar.`,
    );
    return { status: 'created-new', ticketId: t.id };
  }

  private async classifyDedupCreate(
    inbound: InboundMessage,
    resi: { id: string; tenantId: string },
    consorcioId: string,
    unidadId: string | null,
    text: string,
  ): Promise<{ status: string; ticketId: string }> {
    let classified;
    try {
      classified = await this.classifier.classify(text, { promptVersion: CLASSIFIER_PROMPT_VERSION });
    } catch (err) {
      this.log.error({ err: (err as Error).message }, 'classifier failed');
      await this.reply(inbound.from, 'No pude procesar tu reporte en este momento. Probá de nuevo en unos minutos.');
      return { status: 'classifier-error', ticketId: '' };
    }

    let embedding: number[];
    try {
      const e = await this.embedder.embed(classified.descripcion_normalizada);
      embedding = e.vector;
    } catch (err) {
      this.log.warn({ err: (err as Error).message }, 'embed failed; skipping dedup');
      embedding = [];
    }

    // Dedup search (RF-B07).
    // Threshold ajustable por env: con LLM real (OpenAI) usar 0.85; con mock
    // embedder (FNV bag-of-words) baja a ~0.55 porque las normas son chicas.
    const threshold = Number(
      process.env.DEDUP_THRESHOLD ?? (process.env.AI_PROVIDER === 'openai' ? '0.85' : '0.55'),
    );
    if (embedding.length > 0) {
      try {
        const candidate = await findDedupCandidate(consorcioId, embedding, { threshold });
        if (candidate) {
          await upsertSession(inbound.from, {
            step: 'confirm_dedup',
            dedupCandidate: { ...candidate, consorcioId },
            pendingTicketInputs: {
              consorcioId,
              unidadId,
              classifiedTitulo: classified.titulo,
              classifiedDescripcion: classified.descripcion_normalizada,
              classifiedCategoria: classified.categoria,
              classifiedOrigen: classified.origen,
              classifiedUrgencia: classified.urgencia,
              classifiedConfianza: classified.confianza,
              classifiedModelo: classified.modelo,
              classifiedPromptVersion: classified.prompt_version,
              ...(classified.ubicacion !== undefined && { classifiedUbicacion: classified.ubicacion }),
              embedding,
            },
          });
          await this.markWebhookProcessed(inbound.wamid);
          await this.reply(
            inbound.from,
            `Ya hay un reporte parecido: "${candidate.titulo}" (#${candidate.ticketId.slice(0, 8)}). ¿Sumás tu voto? Respondé Sí o No.`,
          );
          return { status: 'dedup-offered', ticketId: candidate.ticketId };
        }
      } catch (err) {
        this.log.warn({ err: (err as Error).message }, 'dedup query failed; creating anyway');
      }
    }

    const t = await this.createTicket({
      tenantId: resi.tenantId,
      consorcioId,
      unidadId,
      reportanteId: resi.id,
      tipo: 'INFRAESTRUCTURA',
      urgencia: classified.urgencia,
      origenSugerido: classified.origen,
      titulo: classified.titulo,
      descripcion: classified.descripcion_normalizada,
      embedding,
      clasificacion: {
        sugerido: classified as unknown as Record<string, unknown>,
        confianza: classified.confianza,
        modelo: classified.modelo,
        promptVersion: classified.prompt_version,
      },
    });
    await this.markWebhookProcessed(inbound.wamid);
    await this.reply(
      inbound.from,
      `Listo, registré tu reporte (#${t.id.slice(0, 8)}). Categoría: ${classified.categoria}, urgencia: ${classified.urgencia}. El administrador lo va a validar.`,
    );
    return { status: 'created', ticketId: t.id };
  }

  private async findResidente(phone: string): Promise<{ id: string; tenantId: string } | undefined> {
    const rows = await systemDb
      .select({ id: residente.id, tenantId: residente.tenantId })
      .from(residente)
      .where(eq(residente.telefonoE164, phone))
      .limit(1);
    return rows[0];
  }

  private async consorciosDelResidente(
    residenteId: string,
    tenantId: string,
  ): Promise<Array<{ consorcioId: string; unidadId: string; nombre: string }>> {
    const rows = await systemDb
      .select({
        unidadId: vinculoResidente.unidadId,
        consorcioId: unidad.consorcioId,
        nombre: consorcio.nombre,
      })
      .from(vinculoResidente)
      .innerJoin(unidad, eq(unidad.id, vinculoResidente.unidadId))
      .innerJoin(consorcio, eq(consorcio.id, unidad.consorcioId))
      .where(
        and(
          eq(vinculoResidente.tenantId, tenantId),
          eq(vinculoResidente.residenteId, residenteId),
          eq(vinculoResidente.activo, true),
        ),
      );
    const seen = new Set<string>();
    const out: Array<{ consorcioId: string; unidadId: string; nombre: string }> = [];
    for (const r of rows) {
      if (seen.has(r.consorcioId)) continue;
      seen.add(r.consorcioId);
      out.push(r);
    }
    return out;
  }

  private async castVote(tenantId: string, ticketId: string, residenteId: string): Promise<void> {
    try {
      await systemDb
        .insert(voto)
        .values({ tenantId, ticketId, residenteId })
        .onConflictDoNothing({ target: [voto.ticketId, voto.residenteId] });
    } catch (err) {
      this.log.warn({ err: (err as Error).message }, 'vote insert failed');
    }
  }

  private async createTicket(input: {
    tenantId: string;
    consorcioId: string;
    unidadId: string | null;
    reportanteId: string;
    tipo: 'INFRAESTRUCTURA' | 'CONDUCTA';
    urgencia: 'CRITICA' | 'ALTA' | 'MEDIA' | 'BAJA';
    origenSugerido: 'UNIDAD' | 'ESPACIO_COMUN';
    titulo: string;
    descripcion: string;
    embedding: number[];
    /**
     * Sugerencia del clasificador. Regla 4 de CLAUDE.md: toda salida de la IA
     * se persiste como sugerencia, y las correcciones del admin se registran
     * aparte para alimentar el dataset. Hasta ahora estos datos se descartaban
     * en el call site y `clasificacion_ia` quedaba vacía.
     */
    clasificacion?: {
      sugerido: Record<string, unknown>;
      confianza: number;
      modelo: string;
      promptVersion: string;
    };
  }) {
    const vecLit = input.embedding.length > 0 ? `[${input.embedding.join(',')}]` : null;
    const inserted = (
      await systemDb
        .insert(ticket)
        .values({
          tenantId: input.tenantId,
          consorcioId: input.consorcioId,
          unidadId: input.unidadId,
          reportanteId: input.reportanteId,
          tipo: input.tipo,
          urgencia: input.urgencia,
          origen: input.origenSugerido,
          titulo: input.titulo,
          descripcionNormalizada: input.descripcion,
          // drizzle vector via custom type expects number[]; passing it directly.
          ...(vecLit && { embedding: input.embedding }),
        })
        .returning()
    )[0]!;

    if (input.clasificacion) {
      // No rompe la creación del ticket si falla: la sugerencia es telemetría,
      // no parte del contrato con el residente.
      try {
        await systemDb.insert(clasificacionIa).values({
          tenantId: input.tenantId,
          ticketId: inserted.id,
          sugerido: input.clasificacion.sugerido,
          confianza: input.clasificacion.confianza,
          modelo: input.clasificacion.modelo,
          promptVersion: input.clasificacion.promptVersion,
        });
      } catch (err) {
        this.log.error(
          { err: (err as Error).message, ticketId: inserted.id },
          'no se pudo persistir clasificacion_ia',
        );
      }
    }

    await systemDb.insert(ticketEvento).values({
      tenantId: input.tenantId,
      ticketId: inserted.id,
      transicion: 'BOT_CREATE',
      estadoNuevo: 'REGISTRADO',
      autorId: input.reportanteId,
      autorTipo: 'BOT',
    });
    return inserted;
  }

  private async markWebhookProcessed(wamid: string) {
    await systemDb
      .update(webhookEvent)
      .set({ estado: 'PROCESADO', processedAt: new Date() })
      .where(eq(webhookEvent.wamid, wamid));
  }

  private async reply(to: string, text: string) {
    try {
      await this.messaging.sendText({ to: to as `+${string}`, text });
    } catch (err) {
      this.log.warn({ err: (err as Error).message, to }, 'reply send failed');
    }
  }
}

void sql;
