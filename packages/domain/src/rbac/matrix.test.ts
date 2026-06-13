import { describe, expect, it } from 'vitest';
import { can, permissionsFor } from './matrix.js';

describe('RBAC matrix', () => {
  it('SUPER_ADMIN can manage tenants', () => {
    expect(can('SUPER_ADMIN', 'tenant.manage')).toBe(true);
  });

  it('ADMIN cannot manage tenants', () => {
    expect(can('ADMIN', 'tenant.manage')).toBe(false);
  });

  it('RESIDENTE cannot validate tickets', () => {
    expect(can('RESIDENTE', 'ticket.validate')).toBe(false);
    expect(can('RESIDENTE', 'ticket.solve')).toBe(false);
    expect(can('RESIDENTE', 'ticket.discard')).toBe(false);
  });

  it('RESIDENTE can create and vote tickets', () => {
    expect(can('RESIDENTE', 'ticket.create')).toBe(true);
    expect(can('RESIDENTE', 'ticket.vote')).toBe(true);
  });

  it('ADMIN can manage gastos and audit', () => {
    expect(can('ADMIN', 'gasto.manage')).toBe(true);
    expect(can('ADMIN', 'audit.read')).toBe(true);
  });

  it('RESIDENTE has inquilino.invite (gated row-level)', () => {
    expect(can('RESIDENTE', 'inquilino.invite')).toBe(true);
  });

  it('ADMIN cannot create tickets directly (admin valida/cierra, no crea)', () => {
    expect(can('ADMIN', 'ticket.create')).toBe(false);
  });

  it('permissionsFor returns full list for each role', () => {
    expect(permissionsFor('SUPER_ADMIN').length).toBeGreaterThanOrEqual(10);
    expect(permissionsFor('ADMIN').length).toBeGreaterThanOrEqual(9);
    expect(permissionsFor('RESIDENTE').length).toBeGreaterThanOrEqual(3);
  });
});
