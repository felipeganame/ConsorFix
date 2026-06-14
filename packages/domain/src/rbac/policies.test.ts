import { describe, expect, it } from 'vitest';
import { canInviteInquilino, canResidenteSeeCosto, canResidenteSeeTicket } from './policies.js';

const cons1 = 'c1';
const unidadA = 'u-A';
const unidadB = 'u-B';

const propietarioDeA = {
  residenteId: 'r-1',
  consorcioIds: new Set([cons1]),
  unidadIds: new Set([unidadA]),
};

const inquilinoDeA = {
  residenteId: 'r-2',
  consorcioIds: new Set([cons1]),
  unidadIds: new Set([unidadA]),
};

const propietarioDeB = {
  residenteId: 'r-3',
  consorcioIds: new Set([cons1]),
  unidadIds: new Set([unidadB]),
};

describe('canInviteInquilino', () => {
  const unidad = {
    unidadId: unidadA,
    vinculos: [
      { residenteId: 'r-1', rol: 'PROPIETARIO' as const, activo: true },
      { residenteId: 'r-2', rol: 'INQUILINO' as const, activo: true },
    ],
  };

  it('propietario activo puede invitar inquilino', () => {
    expect(canInviteInquilino('r-1', unidad)).toBe(true);
  });

  it('inquilino no puede invitar inquilino', () => {
    expect(canInviteInquilino('r-2', unidad)).toBe(false);
  });

  it('propietario inactivo no puede invitar', () => {
    const inactivo = {
      ...unidad,
      vinculos: [{ residenteId: 'r-1', rol: 'PROPIETARIO' as const, activo: false }],
    };
    expect(canInviteInquilino('r-1', inactivo)).toBe(false);
  });

  it('persona externa no puede invitar', () => {
    expect(canInviteInquilino('r-9', unidad)).toBe(false);
  });
});

describe('canResidenteSeeTicket', () => {
  it('ticket COMUN: visible a cualquier residente del consorcio', () => {
    expect(
      canResidenteSeeTicket(propietarioDeB, {
        tipo: 'INFRAESTRUCTURA',
        origen: 'ESPACIO_COMUN',
        unidadId: null,
        consorcioId: cons1,
      }),
    ).toBe(true);
  });

  it('ticket UNIDAD: solo visible a ocupantes de esa unidad', () => {
    const t = {
      tipo: 'INFRAESTRUCTURA' as const,
      origen: 'UNIDAD' as const,
      unidadId: unidadA,
      consorcioId: cons1,
    };
    expect(canResidenteSeeTicket(propietarioDeA, t)).toBe(true);
    expect(canResidenteSeeTicket(inquilinoDeA, t)).toBe(true);
    expect(canResidenteSeeTicket(propietarioDeB, t)).toBe(false);
  });

  it('ticket CONDUCTA: visible solo a ocupantes de la unidad reportada (anonimato del reportante)', () => {
    const t = {
      tipo: 'CONDUCTA' as const,
      origen: null,
      unidadId: unidadA,
      consorcioId: cons1,
    };
    expect(canResidenteSeeTicket(propietarioDeA, t)).toBe(true);
    expect(canResidenteSeeTicket(propietarioDeB, t)).toBe(false);
  });

  it('residente de otro consorcio nunca ve', () => {
    const externo = {
      residenteId: 'r-X',
      consorcioIds: new Set(['c-otro']),
      unidadIds: new Set<string>(),
    };
    expect(
      canResidenteSeeTicket(externo, {
        tipo: 'INFRAESTRUCTURA',
        origen: 'ESPACIO_COMUN',
        unidadId: null,
        consorcioId: cons1,
      }),
    ).toBe(false);
  });

  it('origen sin validar: aplica regla conservadora (UNIDAD)', () => {
    const t = {
      tipo: 'INFRAESTRUCTURA' as const,
      origen: null,
      unidadId: unidadA,
      consorcioId: cons1,
    };
    expect(canResidenteSeeTicket(propietarioDeA, t)).toBe(true);
    expect(canResidenteSeeTicket(propietarioDeB, t)).toBe(false);
  });
});

describe('canResidenteSeeCosto (G10)', () => {
  const comun = {
    tipo: 'INFRAESTRUCTURA' as const,
    origen: 'ESPACIO_COMUN' as const,
    unidadId: null,
    consorcioId: cons1,
  };

  it('costo de ESPACIO_COMUN: visible a cualquier residente del consorcio', () => {
    expect(canResidenteSeeCosto(propietarioDeA, comun)).toBe(true);
    expect(canResidenteSeeCosto(propietarioDeB, comun)).toBe(true);
  });

  it('costo de ticket de UNIDAD: privado, no visible (ni para el ocupante)', () => {
    const unidadTicket = {
      tipo: 'INFRAESTRUCTURA' as const,
      origen: 'UNIDAD' as const,
      unidadId: unidadA,
      consorcioId: cons1,
    };
    expect(canResidenteSeeCosto(propietarioDeA, unidadTicket)).toBe(false);
  });

  it('costo de ticket de CONDUCTA: nunca visible', () => {
    const conducta = {
      tipo: 'CONDUCTA' as const,
      origen: null,
      unidadId: unidadA,
      consorcioId: cons1,
    };
    expect(canResidenteSeeCosto(propietarioDeA, conducta)).toBe(false);
  });

  it('residente de otro consorcio no ve el costo común', () => {
    const externo = {
      residenteId: 'r-X',
      consorcioIds: new Set(['c-otro']),
      unidadIds: new Set<string>(),
    };
    expect(canResidenteSeeCosto(externo, comun)).toBe(false);
  });
});
