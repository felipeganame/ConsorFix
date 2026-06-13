import { InvalidTransitionError } from '../errors.js';
import type { TicketState } from './states.js';

/**
 * Máquina de estados simplificada (decisión producto 2026-06-12).
 *
 * Flujo feliz:    REGISTRADO -> VALIDADO -> SOLUCIONADO
 * Descarte:       REGISTRADO -> DESCARTADO  (admin: no aplica)
 * Cierre tardío:  VALIDADO -> DESCARTADO    (admin: se descubre que no aplica)
 *
 * Sin reapertura desde estado terminal — si reaparece el problema, se crea un
 * ticket nuevo (mantiene la trazabilidad limpia).
 */
const ALLOWED: Readonly<Record<TicketState, readonly TicketState[]>> = {
  REGISTRADO: ['VALIDADO', 'DESCARTADO'],
  VALIDADO: ['SOLUCIONADO', 'DESCARTADO'],
  DESCARTADO: [],
  SOLUCIONADO: [],
};

export function canTransition(from: TicketState, to: TicketState): boolean {
  return ALLOWED[from].includes(to);
}

export function assertTransition(from: TicketState, to: TicketState): void {
  if (!canTransition(from, to)) throw new InvalidTransitionError(from, to);
}

export function nextStates(from: TicketState): readonly TicketState[] {
  return ALLOWED[from];
}
