import type { TicketState } from '@consorciofix/domain';

/**
 * Plantillas de notificación en español (es-AR).
 * Cuando se integre Meta Business, registrar como HSM con estos mismos nombres
 * y mapear `variables` a parámetros de body.
 */
export interface Template {
  name: string;
  body: (vars: Record<string, string>) => string;
}

export const NOTIFICATION_TEMPLATES: Record<string, Template> = {
  ticket_validated: {
    name: 'ticket_validated',
    body: (v) =>
      `Tu reporte #${v.short} fue validado por el administrador. Estado actual: VALIDADO.${
        v.nota ? `\nNota: ${v.nota}` : ''
      }`,
  },
  ticket_solucionado: {
    name: 'ticket_solucionado',
    body: (v) =>
      `Buenas noticias: tu reporte #${v.short} fue marcado como SOLUCIONADO.${
        v.nota ? `\nNota: ${v.nota}` : ''
      }`,
  },
  ticket_descartado: {
    name: 'ticket_descartado',
    body: (v) =>
      `Tu reporte #${v.short} fue descartado por el administrador.${
        v.nota ? `\nMotivo: ${v.nota}` : ''
      }`,
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
