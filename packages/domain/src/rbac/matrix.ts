import type { Permission } from './permissions.js';
import type { Role } from './roles.js';

/**
 * Matriz declarativa Role -> Permission. Es la única fuente de verdad.
 * Toda lógica de autorización en el API consulta `can(role, perm)`.
 *
 * Limitaciones por diseño:
 *  - Esta matriz NO modela autorización por fila (row-level). Para eso usar
 *    helpers específicos (visibilidad de ticket por origen+unidad, alta de
 *    inquilino restringida a unidades propias, etc.) en `rbac/policies.ts`.
 */
const MATRIX: Readonly<Record<Role, ReadonlySet<Permission>>> = {
  SUPER_ADMIN: new Set<Permission>([
    'tenant.manage',
    'consorcio.manage',
    'unidad.manage',
    'categoria.manage',
    'residente.manage',
    'ticket.read',
    'ticket.validate',
    'ticket.discard',
    'ticket.solve',
    'gasto.manage',
    'audit.read',
  ]),
  ADMIN: new Set<Permission>([
    'consorcio.manage',
    'unidad.manage',
    'categoria.manage',
    'residente.manage',
    'ticket.read',
    'ticket.validate',
    'ticket.discard',
    'ticket.solve',
    'gasto.manage',
    'audit.read',
  ]),
  RESIDENTE: new Set<Permission>([
    'ticket.read',
    'ticket.create',
    'ticket.vote',
    // El alta de inquilino la hacen propietarios; se controla a nivel de fila
    // en `canInviteInquilino` (no en la matriz plana).
    'inquilino.invite',
  ]),
};

export function can(role: Role, permission: Permission): boolean {
  return MATRIX[role].has(permission);
}

export function permissionsFor(role: Role): readonly Permission[] {
  return [...MATRIX[role]];
}
