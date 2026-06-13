import { describe, expect, it } from 'vitest';
import { InvalidTransitionError } from '../errors.js';
import { TERMINAL_STATES, TICKET_STATES } from './states.js';
import { assertTransition, canTransition, nextStates } from './transitions.js';

describe('ticket state machine (4-state model)', () => {
  it('happy path: REGISTRADO -> VALIDADO -> SOLUCIONADO', () => {
    expect(canTransition('REGISTRADO', 'VALIDADO')).toBe(true);
    expect(canTransition('VALIDADO', 'SOLUCIONADO')).toBe(true);
  });

  it('admin can DESCARTADO from REGISTRADO or VALIDADO', () => {
    expect(canTransition('REGISTRADO', 'DESCARTADO')).toBe(true);
    expect(canTransition('VALIDADO', 'DESCARTADO')).toBe(true);
  });

  it('rejects illegal jumps', () => {
    expect(canTransition('REGISTRADO', 'SOLUCIONADO')).toBe(false);
    expect(canTransition('DESCARTADO', 'VALIDADO')).toBe(false);
    expect(canTransition('SOLUCIONADO', 'VALIDADO')).toBe(false);
  });

  it('terminal states have no successors', () => {
    for (const t of TERMINAL_STATES) expect(nextStates(t)).toEqual([]);
  });

  it('terminal set matches expectation', () => {
    expect([...TERMINAL_STATES].sort()).toEqual(['DESCARTADO', 'SOLUCIONADO']);
  });

  it('every state has a defined ALLOWED entry (no undefined)', () => {
    for (const s of TICKET_STATES) expect(Array.isArray(nextStates(s))).toBe(true);
  });

  it('throws InvalidTransitionError on illegal transition', () => {
    expect(() => assertTransition('REGISTRADO', 'SOLUCIONADO')).toThrow(InvalidTransitionError);
  });

  it('assertTransition is a no-op on legal transition', () => {
    expect(() => assertTransition('REGISTRADO', 'VALIDADO')).not.toThrow();
    expect(() => assertTransition('VALIDADO', 'SOLUCIONADO')).not.toThrow();
  });

  it('cannot re-validate from descartado (no reopen)', () => {
    expect(canTransition('DESCARTADO', 'REGISTRADO')).toBe(false);
    expect(canTransition('SOLUCIONADO', 'REGISTRADO')).toBe(false);
  });
});
