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

describe('RF-F01 — unidad reportada en conducta', () => {
  const consorcio = 'c1';
  const unidadAcusada = 'u-acusada';
  const unidadDenunciante = 'u-denunciante';

  const acusado = {
    residenteId: 'r-acusado',
    consorcioIds: new Set([consorcio]),
    unidadIds: new Set([unidadAcusada]),
  };
  const denunciante = {
    residenteId: 'r-denunciante',
    consorcioIds: new Set([consorcio]),
    unidadIds: new Set([unidadDenunciante]),
  };
  const ajeno = {
    residenteId: 'r-ajeno',
    consorcioIds: new Set([consorcio]),
    unidadIds: new Set(['u-otra']),
  };

  // El caso real que antes no se podía expresar: el denunciante vive en una
  // unidad y acusa a otra. Con un solo campo `unidadId` había que elegir cuál
  // de las dos guardar.
  const denuncia = {
    tipo: 'CONDUCTA' as const,
    origen: 'UNIDAD' as const,
    unidadId: unidadDenunciante,
    unidadReportadaId: unidadAcusada,
    reportanteId: 'r-denunciante',
    consorcioId: consorcio,
  };

  it('el ocupante de la unidad acusada ve la denuncia', () => {
    expect(canResidenteSeeTicket(acusado, denuncia)).toBe(true);
  });

  it('el denunciante ve su propia denuncia', () => {
    expect(canResidenteSeeTicket(denunciante, denuncia)).toBe(true);
  });

  it('un vecino ajeno no ve la denuncia', () => {
    expect(canResidenteSeeTicket(ajeno, denuncia)).toBe(false);
  });

  it('el costo de una conducta nunca es visible, ni para el acusado', () => {
    expect(canResidenteSeeCosto(acusado, denuncia)).toBe(false);
    expect(canResidenteSeeCosto(denunciante, denuncia)).toBe(false);
  });

  it('sigue funcionando con tickets anteriores a la migración (unidadId como acusada)', () => {
    const viejo = {
      tipo: 'CONDUCTA' as const,
      origen: null,
      unidadId: unidadAcusada,
      consorcioId: consorcio,
    };
    expect(canResidenteSeeTicket(acusado, viejo)).toBe(true);
    expect(canResidenteSeeTicket(ajeno, viejo)).toBe(false);
  });

  it('el reportante ve su ticket aunque no tenga origen ni unidad', () => {
    // Caso que la app móvil crea y que antes no veía NADIE, ni su autor.
    const huerfano = {
      tipo: 'INFRAESTRUCTURA' as const,
      origen: null,
      unidadId: null,
      reportanteId: 'r-denunciante',
      consorcioId: consorcio,
    };
    expect(canResidenteSeeTicket(denunciante, huerfano)).toBe(true);
    expect(canResidenteSeeTicket(ajeno, huerfano)).toBe(false);
  });
});
