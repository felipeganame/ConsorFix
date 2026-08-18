import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { and, eq, inArray, isNull, lte, or } from 'drizzle-orm';
import type { TicketState } from '@consorciofix/domain';
import type { E164Phone } from '@consorciofix/contracts';
import { createWhatsAppProvider } from '@consorciofix/messaging';
import { systemDb } from '../db/client.js';
import { notificacion, residente, voto } from '../db/schema/index.js';
import { sendExpoPush } from './expo-push.js';
import { pickTemplate } from './templates.js';

interface NotifyArgs {
  tenantId: string;
  ticketId: string;
  shortCode: string;
  to: TicketState;
  nota: string | null;
  reportanteId: string | null;
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

    const candidatas = await systemDb
      .select({
        id: notificacion.id,
        canal: notificacion.canal,
        intentos: notificacion.intentos,
        destinatarioId: notificacion.destinatarioId,
        plantilla: notificacion.plantilla,
        ticketId: notificacion.ticketId,
      })
      .from(notificacion)
      .where(
        and(
          inArray(notificacion.estado, ['PENDIENTE', 'FALLIDA']),
          or(isNull(notificacion.proximoIntentoAt), lte(notificacion.proximoIntentoAt, ahora)),
          lte(notificacion.intentos, maxIntentos - 1),
        ),
      )
      .limit(limite);

    let reintentadas = 0;
    let abandonadas = 0;

    for (const n of candidatas) {
      const intento = (n.intentos ?? 0) + 1;
      if (intento > maxIntentos) {
        await systemDb
          .update(notificacion)
          .set({ estado: 'FALLIDA', error: 'agotados los reintentos', proximoIntentoAt: null })
          .where(eq(notificacion.id, n.id));
        abandonadas++;
        continue;
      }

      const dest = (
        await systemDb
          .select({ phone: residente.telefonoE164, pushToken: residente.pushToken })
          .from(residente)
          .where(eq(residente.id, n.destinatarioId))
          .limit(1)
      )[0];
      if (!dest) {
        await systemDb
          .update(notificacion)
          .set({ estado: 'FALLIDA', error: 'destinatario inexistente', proximoIntentoAt: null })
          .where(eq(notificacion.id, n.id));
        abandonadas++;
        continue;
      }

      // El backoff se agenda ANTES de intentar: si el proceso muere durante el
      // envío, la fila no queda elegible de inmediato y no se dispara una
      // tormenta de reintentos al arrancar.
      const esperaMin = NotificationsService.BACKOFF_MIN[intento - 1] ?? 240;
      await systemDb
        .update(notificacion)
        .set({
          intentos: intento,
          ultimoIntentoAt: ahora,
          proximoIntentoAt: new Date(ahora.getTime() + esperaMin * 60_000),
        })
        .where(eq(notificacion.id, n.id));

      const texto = `Actualización de tu reporte #${String(n.ticketId).slice(0, 8)}.`;
      if (n.canal === 'WHATSAPP') {
        await this.sendWhatsApp(n.id, dest.phone as E164Phone, texto, n.destinatarioId);
      } else if (n.canal === 'PUSH' && dest.pushToken) {
        await this.sendPush(n.id, dest.pushToken, String(n.ticketId).slice(0, 8), 'VALIDADO', null);
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

    const text = tpl.body({ short: args.shortCode, nota: args.nota ?? '' });

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
        void this.sendPush(pushNotif[0]!.id, r.pushToken, args.shortCode, args.to, args.nota);
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
        .set({ estado: 'FALLIDA', error: msg.slice(0, 500), intentos: 1 })
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
        .set({ estado: 'FALLIDA', error: msg.slice(0, 500), intentos: 1 })
        .where(eq(notificacion.id, notifId));
    }
  }
}
