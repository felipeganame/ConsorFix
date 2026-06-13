import { Injectable, Logger } from '@nestjs/common';
import { and, eq, inArray } from 'drizzle-orm';
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
export class NotificationsService {
  private readonly log = new Logger(NotificationsService.name);
  private readonly messaging = createWhatsAppProvider();
  private readonly expoToken = process.env.EXPO_ACCESS_TOKEN;

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
      void this.sendWhatsApp(waNotif[0]!.id, r.phone as E164Phone, text);

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

  private async sendWhatsApp(notifId: string, phone: E164Phone, text: string): Promise<void> {
    try {
      const res = await this.messaging.sendText({ to: phone, text });
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
