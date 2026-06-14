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
  consorcioId: string;
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

  if (ticket.tipo === 'CONDUCTA') {
    // Solo ocupantes de la unidad reportada.
    return ticket.unidadId !== null && user.unidadIds.has(ticket.unidadId);
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
