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
 *
 * Los costos de una unidad NO son públicos, pero sí son visibles para los
 * ocupantes de ESA unidad: son quienes pagan la reparación de su propio
 * departamento. Hasta 2026-08-18 esta función devolvía `false` para todo lo que
 * no fuera ESPACIO_COMUN, así que el propietario del 1A reportaba una pérdida
 * en su baño, el admin cargaba la factura del plomero, y el propietario recibía
 * un 404 al pedir el monto: la app no tenía forma de mostrarle lo que debía.
 * G10 existe para que el costo privado no se filtre al *resto* del consorcio,
 * no para ocultárselo al afectado.
 */
export function canResidenteSeeCosto(
  user: ResidenteCtx,
  ticket: TicketVisibilityCtx,
): boolean {
  if (!canResidenteSeeTicket(user, ticket)) return false;
  // CONDUCTA: el costo de una sanción o de un arreglo por daños queda solo para
  // el admin. Publicárselo al denunciado o al denunciante convierte el monto en
  // parte del conflicto entre vecinos (G11).
  if (ticket.tipo !== 'INFRAESTRUCTURA') return false;
  // Espacio común: transparencia total, es la propuesta de valor (G10).
  if (ticket.origen === 'ESPACIO_COMUN') return true;
  // UNIDAD (y origen todavía sin validar, que se trata como UNIDAD por defecto
  // seguro): solo ocupantes de la unidad afectada. Ojo, no alcanza con ser el
  // reportante: un vecino puede reportar la filtración del 1A y no por eso ve
  // la factura del 1A.
  return ticket.unidadId !== null && user.unidadIds.has(ticket.unidadId);
}
