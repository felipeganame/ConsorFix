import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { and, eq, gte, inArray, sql } from 'drizzle-orm';
import type { TicketState } from '@consorciofix/domain';
import type { E164Phone } from '@consorciofix/contracts';
import { createWhatsAppProvider } from '@consorciofix/messaging';
import { systemDb } from '../db/client.js';
import { notificacion, residente, ticket, voto } from '../db/schema/index.js';
import { sendExpoPush } from './expo-push.js';
import { pickTemplate } from './templates.js';

interface NotifyArgs {
  tenantId: string;
  ticketId: string;
  shortCode: string;
  to: TicketState;
  reportanteId: string | null;
  // `nota` se quitó a propósito: era la nota INTERNA del admin y terminaba en el
  // mensaje que recibe el vecino. Sacarla del contrato hace que el compilador
  // señale a cualquiera que intente volver a pasarla.
}

/**
 * Notifica al reportante + votantes (RF-G01, RF-G03).
 * - Persistencia inmediata en `notificacion` para audit + retry.
 * - WA outbound vía adapter (template).
 * - Expo Push outbound si residente tiene push_token registrado (RF-E07).
 * Todo fire-and-forget — no bloquea el flujo de transition.
 */
@Injectable()
export class NotificationsService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(NotificationsService.name);
  private readonly messaging = createWhatsAppProvider();
  private readonly expoToken = process.env.EXPO_ACCESS_TOKEN;
  private reaper: NodeJS.Timeout | null = null;

  /** Backoff entre reintentos, en minutos. Después del último se abandona. */
  private static readonly BACKOFF_MIN = [1, 5, 15, 60, 240];

  onModuleInit(): void {
    // Se puede apagar en tests o en procesos que no deban reintentar.
    if (process.env.NOTIF_REAPER_DISABLED === '1') return;
    const cadaMs = Number(process.env.NOTIF_REAPER_INTERVAL_MS ?? 60_000);
    this.reaper = setInterval(() => {
      void this.reintentarPendientes().catch((err) => {
        this.log.error({ err: (err as Error).message }, 'el reaper de notificaciones falló');
      });
    }, cadaMs);
    // No mantiene el proceso vivo por sí solo.
    this.reaper.unref?.();
  }

  onModuleDestroy(): void {
    if (this.reaper) clearInterval(this.reaper);
  }

  /**
   * Recoge las notificaciones que quedaron colgadas y las reintenta con backoff.
   *
   * La fila de `notificacion` ya se creaba como PENDIENTE antes de enviar, así
   * que la base venía funcionando como cola — lo que faltaba era esto. Si la API
   * se reiniciaba a mitad de un envío, la fila quedaba PENDIENTE para siempre y
   * nadie se enteraba.
   *
   * No se usa una cola nueva en BullMQ a propósito: el estado ya está en la
   * base, y duplicarlo en Redis agregaría una fuente de verdad más sin resolver
   * nada que esto no resuelva.
   */
  async reintentarPendientes(limite = 25): Promise<{ reintentadas: number; abandonadas: number }> {
    const ahora = new Date();
    const maxIntentos = NotificationsService.BACKOFF_MIN.length;

    // Barrido de arrastre: si el proceso murió entre el claim del último intento
    // y su resultado, la fila quedó PENDIENTE con los intentos agotados. El
    // predicado del claim la excluye para siempre, así que sin esto desaparecía
    // en silencio, sin reintentarse ni contarse como abandonada.
    await systemDb
      .update(notificacion)
      .set({ estado: 'FALLIDA', error: 'agotados los reintentos' })
      .where(
        and(
          eq(notificacion.estado, 'PENDIENTE'),
          gte(notificacion.intentos, maxIntentos),
        ),
      );

    // Claim ATÓMICO con FOR UPDATE SKIP LOCKED. Con un SELECT plano, dos
    // procesos de API —y `onModuleInit` arranca un reaper en CADA uno— tomaban
    // la misma fila en la misma ventana y la notificación salía duplicada.
    // El ORDER BY evita además que unas pocas filas envenenadas monopolicen el
    // cupo de cada pasada y dejen sin atender a las nuevas.
    const claimed = await systemDb.execute(sql`
      WITH elegidas AS (
        SELECT id FROM notificacion
         WHERE estado IN ('PENDIENTE', 'FALLIDA')
           AND (proximo_intento_at IS NULL OR proximo_intento_at <= ${ahora})
           AND intentos < ${maxIntentos}
         ORDER BY created_at ASC, proximo_intento_at ASC NULLS FIRST
         LIMIT ${limite}
         FOR UPDATE SKIP LOCKED
      )
      UPDATE notificacion n
         SET intentos = n.intentos + 1,
             ultimo_intento_at = ${ahora},
             -- El backoff se agenda ANTES de intentar: si el proceso muere en
             -- el envío, la fila no queda elegible de inmediato.
             proximo_intento_at = ${ahora}::timestamptz
               + (CASE n.intentos WHEN 0 THEN 1 WHEN 1 THEN 5 WHEN 2 THEN 15 WHEN 3 THEN 60 ELSE 240 END
                  * interval '1 minute')
        FROM elegidas e
       WHERE n.id = e.id
      RETURNING n.id, n.tenant_id, n.canal, n.intentos, n.destinatario_id, n.plantilla, n.ticket_id
    `);
    const filas = ((claimed as unknown as { rows?: unknown[] }).rows ??
      (claimed as unknown as unknown[])) as Array<{
      id: string;
      tenant_id: string;
      canal: string;
      intentos: number;
      destinatario_id: string;
      plantilla: string;
      ticket_id: string;
    }>;
    const candidatas = filas.map((f) => ({
      id: f.id,
      tenantId: f.tenant_id,
      canal: f.canal,
      intentos: f.intentos,
      destinatarioId: f.destinatario_id,
      plantilla: f.plantilla,
      ticketId: f.ticket_id,
    }));

    let reintentadas = 0;
    let abandonadas = 0;

    for (const n of candidatas) {
      // A2: el destinatario se busca DENTRO de su tenant. `destinatario_id` no
      // tiene FK y `destinatario_tipo` admite ADMIN, así que sin este filtro un
      // id podía resolverse a un teléfono de otra administración — sobre
      // systemDb, que bypassa RLS.
      const dest = (
        await systemDb
          .select({ phone: residente.telefonoE164, pushToken: residente.pushToken })
          .from(residente)
          .where(and(eq(residente.tenantId, n.tenantId), eq(residente.id, n.destinatarioId)))
          .limit(1)
      )[0];
      if (!dest) {
        await systemDb
          .update(notificacion)
          .set({ estado: 'FALLIDA', error: 'destinatario inexistente', intentos: maxIntentos })
          .where(eq(notificacion.id, n.id));
        abandonadas++;
        continue;
      }

      // B6: se reconstruye el mensaje desde el ESTADO REAL del ticket y su
      // plantilla. Antes el reaper mandaba un texto genérico con 8 hex del UUID
      // y le pasaba 'VALIDADO' hardcodeado al push: un ticket DESCARTADO le
      // llegaba al residente titulado "Reporte validado" — información falsa
      // sobre su reclamo.
      const tk = (
        await systemDb
          .select({ estado: ticket.estado, shortCode: ticket.shortCode, id: ticket.id })
          .from(ticket)
          .where(and(eq(ticket.tenantId, n.tenantId), eq(ticket.id, n.ticketId)))
          .limit(1)
      )[0];
      if (!tk) {
        await systemDb
          .update(notificacion)
          .set({ estado: 'FALLIDA', error: 'ticket inexistente', intentos: maxIntentos })
          .where(eq(notificacion.id, n.id));
        abandonadas++;
        continue;
      }

      const estado = tk.estado as TicketState;
      const tpl = pickTemplate(estado);
      // SIN '#': las plantillas y sendPush ya lo agregan. Con el numeral acá
      // salía "Tu reporte ##a1b2c3d4". Y no era un borde: `ticket.short_code`
      // no lo escribe NADIE —la columna existe y ningún insert la setea— así
      // que el fallback se toma siempre.
      const legible = tk.shortCode ?? tk.id.slice(0, 8);
      const texto = tpl
        ? tpl.body({ short: legible, nota: '' })
        : `Actualización de tu reporte ${legible}.`;

      if (n.canal === 'WHATSAPP') {
        await this.sendWhatsApp(n.id, dest.phone as E164Phone, texto, n.destinatarioId);
      } else if (n.canal === 'PUSH' && dest.pushToken) {
        await this.sendPush(n.id, dest.pushToken, legible, estado, null);
      } else {
        await systemDb
          .update(notificacion)
          .set({ estado: 'FALLIDA', error: 'sin canal disponible', intentos: maxIntentos })
          .where(eq(notificacion.id, n.id));
        abandonadas++;
        continue;
      }

      reintentadas++;
    }

    if (reintentadas || abandonadas) {
      this.log.log({ reintentadas, abandonadas }, 'reaper de notificaciones');
    }
    return { reintentadas, abandonadas };
  }

  /**
   * Registra el último mensaje entrante del residente: define la ventana de
   * 24 h de WhatsApp (RF-G02).
   */
  async registrarInbound(residenteId: string): Promise<void> {
    await systemDb
      .update(residente)
      .set({ ultimoInboundAt: new Date() })
      .where(eq(residente.id, residenteId));
  }

  /**
   * ¿Se puede mandar texto libre? Meta lo permite solo dentro de las 24 h desde
   * el último mensaje del usuario; fuera de eso exige una plantilla aprobada.
   *
   * Hasta ahora se mandaba SIEMPRE texto libre, así que fuera de la ventana Meta
   * lo rechazaba y la notificación se perdía sin que nadie lo notara.
   */
  async dentroDeVentana24h(residenteId: string): Promise<boolean> {
    const r = (
      await systemDb
        .select({ ultimo: residente.ultimoInboundAt })
        .from(residente)
        .where(eq(residente.id, residenteId))
        .limit(1)
    )[0];
    if (!r?.ultimo) return false;
    return Date.now() - r.ultimo.getTime() < 24 * 60 * 60 * 1000;
  }

  async notifyTransition(args: NotifyArgs): Promise<void> {
    const tpl = pickTemplate(args.to);
    if (!tpl) return;

    const destinatarios = new Set<string>();
    if (args.reportanteId) destinatarios.add(args.reportanteId);
    const votantes = await systemDb
      .select({ id: voto.residenteId })
      .from(voto)
      .where(and(eq(voto.tenantId, args.tenantId), eq(voto.ticketId, args.ticketId)));
    for (const v of votantes) destinatarios.add(v.id);
    if (destinatarios.size === 0) return;

    const ids = Array.from(destinatarios);
    const rows = await systemDb
      .select({
        id: residente.id,
        phone: residente.telefonoE164,
        pushToken: residente.pushToken,
        nombre: residente.nombre,
      })
      .from(residente)
      .where(and(eq(residente.tenantId, args.tenantId), inArray(residente.id, ids)));

    const text = tpl.body({ short: args.shortCode });

    for (const r of rows) {
      // 1. WhatsApp channel.
      const waNotif = await systemDb
        .insert(notificacion)
        .values({
          tenantId: args.tenantId,
          ticketId: args.ticketId,
          destinatarioId: r.id,
          destinatarioTipo: 'RESIDENTE',
          canal: 'WHATSAPP',
          plantilla: tpl.name,
          estado: 'PENDIENTE',
        })
        .returning({ id: notificacion.id });
      void this.sendWhatsApp(waNotif[0]!.id, r.phone as E164Phone, text, r.id);

      // 2. Push channel (si hay token registrado).
      if (r.pushToken) {
        const pushNotif = await systemDb
          .insert(notificacion)
          .values({
            tenantId: args.tenantId,
            ticketId: args.ticketId,
            destinatarioId: r.id,
            destinatarioTipo: 'RESIDENTE',
            canal: 'PUSH',
            plantilla: tpl.name,
            estado: 'PENDIENTE',
          })
          .returning({ id: notificacion.id });
        void this.sendPush(pushNotif[0]!.id, r.pushToken, args.shortCode, args.to, null);
      }
    }
  }

  private async sendWhatsApp(
    notifId: string,
    phone: E164Phone,
    text: string,
    destinatarioId?: string,
  ): Promise<void> {
    try {
      // RF-G02: dentro de la ventana de 24 h se puede mandar texto libre; fuera
      // hay que usar una plantilla aprobada o Meta lo rechaza.
      const libre = destinatarioId ? await this.dentroDeVentana24h(destinatarioId) : true;
      const res = libre
        ? await this.messaging.sendText({ to: phone, text })
        : await this.messaging.sendTemplate({
            to: phone,
            template: 'ticket_actualizacion',
            variables: { cuerpo: text },
          });
      await systemDb
        .update(notificacion)
        .set({ estado: 'ENVIADA', providerMessageId: res.providerMessageId })
        .where(eq(notificacion.id, notifId));
    } catch (err) {
      const msg = (err as Error).message;
      this.log.warn({ err: msg, phone }, 'wa notification send failed');
      await systemDb
        .update(notificacion)
        // Antes acá había un `intentos: 1` literal, que RESETEABA el contador
        // que el reaper acababa de incrementar. La fila oscilaba entre 1 y 2 sin
        // llegar nunca al máximo: reintentos infinitos, con costo por mensaje, y
        // la rama de abandono era código muerto.
        .set({ estado: 'FALLIDA', error: msg.slice(0, 500) })
        .where(eq(notificacion.id, notifId));
    }
  }

  private async sendPush(
    notifId: string,
    pushToken: string,
    shortCode: string,
    state: TicketState,
    nota: string | null,
  ): Promise<void> {
    const title = state === 'SOLUCIONADO'
      ? 'Reporte resuelto'
      : state === 'VALIDADO'
        ? 'Reporte validado'
        : state === 'DESCARTADO'
          ? 'Reporte descartado'
          : 'Actualización';
    const body = `#${shortCode}${nota ? ` · ${nota.slice(0, 80)}` : ''}`;
    try {
      const out = await sendExpoPush(
        [{ to: pushToken, title, body, sound: 'default', data: { shortCode, state } }],
        this.expoToken,
      );
      const first = out[0];
      if (first?.status === 'ok') {
        await systemDb
          .update(notificacion)
          .set({ estado: 'ENVIADA', providerMessageId: first.id ?? null })
          .where(eq(notificacion.id, notifId));
      } else {
        throw new Error(first?.message ?? 'expo error');
      }
    } catch (err) {
      const msg = (err as Error).message;
      this.log.warn({ err: msg }, 'push notification send failed');
      await systemDb
        .update(notificacion)
        .set({ estado: 'FALLIDA', error: msg.slice(0, 500) })
        .where(eq(notificacion.id, notifId));
    }
  }
}
