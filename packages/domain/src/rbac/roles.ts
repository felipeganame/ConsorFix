export const ROLES = ['SUPER_ADMIN', 'ADMIN', 'RESIDENTE'] as const;
export type Role = (typeof ROLES)[number];

export const VINCULO_ROLES = ['PROPIETARIO', 'INQUILINO'] as const;
export type VinculoRol = (typeof VINCULO_ROLES)[number];
