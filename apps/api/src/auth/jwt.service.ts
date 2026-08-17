import { Injectable, UnauthorizedException } from '@nestjs/common';
import { SignJWT, jwtVerify } from 'jose';

export type UserKind = 'SUPER_ADMIN' | 'ADMIN' | 'RESIDENTE';

export interface AccessPayload {
  sub: string;
  kind: UserKind;
  tid: string | null; // tenant_id (NULL for SUPER_ADMIN)
}

export interface RefreshPayload {
  sub: string;
  kind: UserKind;
  tid: string | null;
  typ: 'refresh';
}

@Injectable()
export class JwtService {
  private readonly secret = new TextEncoder().encode(
    process.env.JWT_SECRET ?? 'change-me-in-prod',
  );
  private readonly accessTtl = process.env.JWT_ACCESS_TTL ?? '15m';
  private readonly refreshTtl = process.env.JWT_REFRESH_TTL ?? '7d';

  async signAccess(payload: AccessPayload): Promise<string> {
    return new SignJWT({ kind: payload.kind, tid: payload.tid })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(payload.sub)
      .setIssuedAt()
      .setExpirationTime(this.accessTtl)
      .sign(this.secret);
  }

  async signRefresh(payload: Omit<RefreshPayload, 'typ'>): Promise<string> {
    return new SignJWT({ kind: payload.kind, tid: payload.tid, typ: 'refresh' })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(payload.sub)
      .setIssuedAt()
      .setExpirationTime(this.refreshTtl)
      .sign(this.secret);
  }

  async verifyAccess(token: string): Promise<AccessPayload> {
    try {
      const { payload } = await jwtVerify(token, this.secret);
      if (typeof payload.sub !== 'string' || typeof payload.kind !== 'string') {
        throw new UnauthorizedException('invalid token payload');
      }
      // Un refresh NO sirve como access. Ambos se firman con el mismo secreto,
      // así que sin este chequeo el token de 7 días funcionaba como bearer:
      // uno robado del navegador valía una semana en vez de 15 minutos.
      if (payload.typ === 'refresh') {
        throw new UnauthorizedException('refresh token no válido como access');
      }
      return {
        sub: payload.sub,
        kind: payload.kind as UserKind,
        tid: (payload.tid as string | null) ?? null,
      };
    } catch {
      throw new UnauthorizedException('invalid or expired token');
    }
  }

  async verifyRefresh(token: string): Promise<RefreshPayload> {
    try {
      const { payload } = await jwtVerify(token, this.secret);
      if (payload.typ !== 'refresh' || typeof payload.sub !== 'string') {
        throw new UnauthorizedException('not a refresh token');
      }
      return {
        sub: payload.sub,
        kind: payload.kind as UserKind,
        tid: (payload.tid as string | null) ?? null,
        typ: 'refresh',
      };
    } catch {
      throw new UnauthorizedException('invalid refresh token');
    }
  }
}
