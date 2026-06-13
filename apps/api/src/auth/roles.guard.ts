import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Role } from '@consorciofix/domain';
import type { AuthedRequest } from './auth.guard.js';

export const ROLES_META = 'roles';
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_META, roles);

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_META, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    const kind = req.user?.kind;
    if (!kind) throw new ForbiddenException('no user context');
    if (!required.includes(kind as Role)) throw new ForbiddenException('insufficient role');
    return true;
  }
}
