import {
  type CallHandler,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import { AsyncLocalStorage } from 'node:async_hooks';
import { type Observable, from } from 'rxjs';
import { switchMap } from 'rxjs/operators';
import { withTenant } from '../db/client.js';
import type { AuthedRequest } from '../auth/auth.guard.js';

/**
 * Wraps every request in `withTenant(tenant_id)` so RLS is enforced for
 * the lifetime of the request transaction. Public routes (login, webhooks,
 * health) must opt out via `@Public()`.
 *
 * SUPER_ADMIN sin tenant en el token requiere un header `x-tenant-id`
 * para operar contra un tenant específico (impersonation).
 */
const als = new AsyncLocalStorage<{ tenantId: string }>();
export function currentTenantId(): string | undefined {
  return als.getStore()?.tenantId;
}

@Injectable()
export class TenantContextInterceptor implements NestInterceptor {
  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    if (!req.user) return next.handle();

    let tenantId: string | null = req.user.tid;
    if (req.user.kind === 'SUPER_ADMIN') {
      const headerTid = req.headers['x-tenant-id'];
      if (typeof headerTid === 'string' && headerTid.length > 0) tenantId = headerTid;
    }
    if (!tenantId) {
      throw new ForbiddenException('no tenant context (set x-tenant-id for SUPER_ADMIN)');
    }

    const tid = tenantId;
    return from(
      withTenant(tid, async () => {
        return new Promise<unknown>((resolve, reject) => {
          als.run({ tenantId: tid }, () => {
            next
              .handle()
              .toPromise()
              .then(resolve, reject);
          });
        });
      }),
    ).pipe(switchMap((v) => from(Promise.resolve(v))));
  }
}
