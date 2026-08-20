import type { TicketState } from '@consorciofix/domain';

/**
 * Plantillas de notificación en español (es-AR).
 * Cuando se integre Meta Business, registrar como HSM con estos mismos nombres
 * y mapear `variables` a parámetros de body.
 *
 * **Ninguna plantilla interpola la nota del admin.** Las tres lo hacían, y esa
 * nota la pide el panel bajo el rótulo "NOTA INTERNA — contexto para el equipo":
 * escribir ahí "ojo que este vecino reclama por todo" se lo mandaba por WhatsApp
 * al vecino, y no solo al que reportó —la notificación va también a todos los que
 * votaron el ticket—. Un texto libre pedido como privado no puede terminar en un
 * mensaje saliente.
 *
 * Si hace falta decirle algo al vecino al cambiar de estado, va en un campo
 * propio con su rótulo ("mensaje para el vecino"), no reusando el interno.
 */
export interface Template {
  name: string;
  body: (vars: Record<string, string>) => string;
}

export const NOTIFICATION_TEMPLATES: Record<string, Template> = {
  ticket_validated: {
    name: 'ticket_validated',
    body: (v) =>
      `Tu reporte #${v.short} fue validado por el administrador. Estado actual: VALIDADO.`,
  },
  ticket_solucionado: {
    name: 'ticket_solucionado',
    body: (v) =>
      `Buenas noticias: tu reporte #${v.short} fue marcado como SOLUCIONADO.`,
  },
  ticket_descartado: {
    name: 'ticket_descartado',
    body: (v) =>
      `Tu reporte #${v.short} fue descartado por el administrador.`,
  },
};

export function pickTemplate(to: TicketState): Template | undefined {
  switch (to) {
    case 'VALIDADO':
      return NOTIFICATION_TEMPLATES.ticket_validated;
    case 'SOLUCIONADO':
      return NOTIFICATION_TEMPLATES.ticket_solucionado;
    case 'DESCARTADO':
      return NOTIFICATION_TEMPLATES.ticket_descartado;
    default:
      return undefined;
  }
}
