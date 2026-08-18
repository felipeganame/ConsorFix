import type { VinculoRol } from './roles.js';

/**
 * Decisiones de autorización a nivel de fila (row-level), separadas de la
 * matriz plana porque dependen del contexto del recurso.
 *
 * `can()` (matrix.ts) responde: ¿el rol puede invocar esta acción en abstracto?
 * Esta capa responde: ¿este usuario concreto puede tocar este recurso concreto?
 */

export interface UnidadOccupancy {
  unidadId: string;
  vinculos: ReadonlyArray<{ residenteId: string; rol: VinculoRol; activo: boolean }>;
}

/** Un PROPIETARIO activo de la unidad puede invitar inquilinos a ESA unidad. */
export function canInviteInquilino(
  residenteId: string,
  unidad: UnidadOccupancy,
): boolean {
  return unidad.vinculos.some(
    (v) => v.residenteId === residenteId && v.rol === 'PROPIETARIO' && v.activo,
  );
}

/**
 * Reglas de visibilidad de un ticket para un RESIDENTE.
 *
 * - origen ESPACIO_COMUN: visible a todos los residentes del consorcio.
 * - origen UNIDAD (infraestructura interna): visible solo a ocupantes
 *   activos (propietarios + inquilinos) de la unidad y al admin.
 * - tipo CONDUCTA: visible solo a ocupantes activos de la unidad reportada
 *   y al admin. Identidad del reportante nunca se expone al residente.
 */
export interface TicketVisibilityCtx {
  tipo: 'INFRAESTRUCTURA' | 'CONDUCTA';
  origen: 'UNIDAD' | 'ESPACIO_COMUN' | null;
  unidadId: string | null;
  /** Unidad acusada, solo en CONDUCTA (RF-F01). */
  unidadReportadaId?: string | null;
  consorcioId: string;
  /** Quién reportó. Permite que el reportante vea su propio ticket. */
  reportanteId?: string | null;
}

export interface ResidenteCtx {
  residenteId: string;
  consorcioIds: ReadonlySet<string>;
  unidadIds: ReadonlySet<string>; // unidades donde tiene vínculo activo
}

export function canResidenteSeeTicket(
  user: ResidenteCtx,
  ticket: TicketVisibilityCtx,
): boolean {
  // Debe pertenecer al consorcio del ticket.
  if (!user.consorcioIds.has(ticket.consorcioId)) return false;

  // Quien reportó siempre ve su propio ticket. Sin esta cláusula, un reporte
  // creado sin origen ni unidad (la app móvil los crea así) quedaba invisible
  // para TODOS, incluido su autor, hasta que el admin lo validara.
  if (ticket.reportanteId && ticket.reportanteId === user.residenteId) return true;

  if (ticket.tipo === 'CONDUCTA') {
    // Solo ocupantes de la unidad ACUSADA. Se lee de `unidadReportadaId`, con
    // fallback a `unidadId` para los tickets anteriores a la migración 0004,
    // donde ese campo cumplía ese rol.
    const acusada = ticket.unidadReportadaId ?? ticket.unidadId;
    return acusada !== null && acusada !== undefined && user.unidadIds.has(acusada);
  }
  // INFRAESTRUCTURA:
  if (ticket.origen === 'ESPACIO_COMUN') return true;
  if (ticket.origen === 'UNIDAD') {
    return ticket.unidadId !== null && user.unidadIds.has(ticket.unidadId);
  }
  // origen aún no validado por admin: tratarlo como UNIDAD por defecto seguro.
  return ticket.unidadId !== null && user.unidadIds.has(ticket.unidadId);
}

/**
 * Reglas de visibilidad del COSTO confirmado de un ticket para un RESIDENTE (G10).
 *
 * La transparencia de costos es la propuesta de valor, pero solo aplica a
 * espacios comunes: el costo confirmado de un ticket ESPACIO_COMUN es visible
 * a todos los residentes del consorcio. Los costos de tickets de UNIDAD o de
 * CONDUCTA son privados (no se exponen en el feed del residente).
 *
 * Presupuestos/borradores no se consideran acá: el caller debe filtrar por
 * gasto.estado = CONFIRMADO antes de exponer montos.
 */
export function canResidenteSeeCosto(
  user: ResidenteCtx,
  ticket: TicketVisibilityCtx,
): boolean {
  if (!canResidenteSeeTicket(user, ticket)) return false;
  return ticket.tipo === 'INFRAESTRUCTURA' && ticket.origen === 'ESPACIO_COMUN';
}
