export const TICKET_STATES = [
  'REGISTRADO',
  'VALIDADO',
  'DESCARTADO',
  'SOLUCIONADO',
] as const;

export type TicketState = (typeof TICKET_STATES)[number];

export const TERMINAL_STATES: ReadonlySet<TicketState> = new Set(['DESCARTADO', 'SOLUCIONADO']);

export const TICKET_ORIGEN = ['UNIDAD', 'ESPACIO_COMUN'] as const;
export type TicketOrigen = (typeof TICKET_ORIGEN)[number];

export const TICKET_TIPO = ['INFRAESTRUCTURA', 'CONDUCTA'] as const;
export type TicketTipo = (typeof TICKET_TIPO)[number];
