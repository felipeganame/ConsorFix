import { Injectable, UnauthorizedException } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { systemDb } from '../db/client.js';
import { residente, usuarioAdmin } from '../db/schema/index.js';
import { JwtService, type UserKind } from './jwt.service.js';
import { PasswordService } from './password.service.js';

export interface LoginResult {
  accessToken: string;
  refreshToken: string;
  user: { id: string; kind: UserKind; tenantId: string | null; nombre: string; email: string };
}

@Injectable()
export class AuthService {
  constructor(
    private readonly jwt: JwtService,
    private readonly passwords: PasswordService,
  ) {}

  /**
   * Login unificado: prueba admin/super_admin primero, fallback a residente.
   * Usa `systemDb` (owner pool) — la búsqueda por email es cross-tenant
   * (aún no sabemos a qué tenant pertenece el usuario).
   */
  async login(email: string, password: string): Promise<LoginResult> {
    const adminRows = await systemDb
      .select()
      .from(usuarioAdmin)
      .where(eq(usuarioAdmin.email, email))
      .limit(1);
    const admin = adminRows[0];
    if (admin && admin.activo && (await this.passwords.verify(admin.passwordHash, password))) {
      return this.issue(admin.id, admin.rol, admin.tenantId, admin.nombre, admin.email);
    }

    const resiRows = await systemDb
      .select()
      .from(residente)
      .where(eq(residente.email, email))
      .limit(1);
    const resi = resiRows[0];
    if (resi && resi.activo && resi.passwordHash) {
      const ok = await this.passwords.verify(resi.passwordHash, password);
      if (ok) {
        return this.issue(resi.id, 'RESIDENTE', resi.tenantId, resi.nombre, resi.email ?? email);
      }
    }

    throw new UnauthorizedException('invalid credentials');
  }

  private async issue(
    id: string,
    kind: UserKind,
    tenantId: string | null,
    nombre: string,
    email: string,
  ): Promise<LoginResult> {
    const [accessToken, refreshToken] = await Promise.all([
      this.jwt.signAccess({ sub: id, kind, tid: tenantId }),
      this.jwt.signRefresh({ sub: id, kind, tid: tenantId }),
    ]);
    return { accessToken, refreshToken, user: { id, kind, tenantId, nombre, email } };
  }

  async refresh(refreshToken: string): Promise<{ accessToken: string; refreshToken: string }> {
    const payload = await this.jwt.verifyRefresh(refreshToken);
    const [access, refresh] = await Promise.all([
      this.jwt.signAccess({ sub: payload.sub, kind: payload.kind, tid: payload.tid }),
      this.jwt.signRefresh({ sub: payload.sub, kind: payload.kind, tid: payload.tid }),
    ]);
    return { accessToken: access, refreshToken: refresh };
  }
}
