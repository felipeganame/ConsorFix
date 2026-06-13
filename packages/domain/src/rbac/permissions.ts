export const PERMISSIONS = [
  // Tenancy
  'tenant.manage',
  'consorcio.manage',
  'unidad.manage',
  'categoria.manage',
  // Personas
  'residente.manage', // ADMIN: cualquier residente del tenant
  'inquilino.invite', // PROPIETARIO: solo de SUS unidades
  // Tickets
  'ticket.read',
  'ticket.create',
  'ticket.validate',  // admin pasa REGISTRADO -> VALIDADO (decide origen)
  'ticket.discard',   // admin pasa REGISTRADO|VALIDADO -> DESCARTADO
  'ticket.solve',     // admin pasa VALIDADO -> SOLUCIONADO
  'ticket.vote',
  // Costos
  'gasto.manage',
  // Auditoría
  'audit.read',
] as const;

export type Permission = (typeof PERMISSIONS)[number];
