import { Injectable, Logger } from '@nestjs/common';
import { systemDb } from '../db/client.js';
import { auditLog } from '../db/schema/index.js';

export interface AuditArgs {
  tenantId: string;
  actorId: string | null;
  actorTipo: 'ADMIN' | 'SUPER_ADMIN' | 'SISTEMA';
  accion: string;
  entidad: string;
  entidadId: string | null;
  detalle?: Record<string, unknown>;
}

/**
 * audit_log es append-only (grants en migración 0002: solo INSERT + SELECT
 * sobre app_user). Errores acá NO interrumpen el flujo principal.
 */
@Injectable()
export class AuditService {
  private readonly log = new Logger(AuditService.name);

  async record(args: AuditArgs): Promise<void> {
    try {
      await systemDb.insert(auditLog).values({
        tenantId: args.tenantId,
        actorId: args.actorId,
        actorTipo: args.actorTipo,
        accion: args.accion,
        entidad: args.entidad,
        entidadId: args.entidadId,
        detalle: args.detalle ?? null,
      });
    } catch (err) {
      this.log.warn({ err: (err as Error).message, accion: args.accion }, 'audit insert failed');
    }
  }
}
