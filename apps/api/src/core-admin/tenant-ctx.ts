import { ForbiddenException } from '@nestjs/common';
import type { AuthedRequest } from '../auth/auth.guard.js';

/** Extracts tenant_id from the authenticated request. Allows SUPER_ADMIN
 * to impersonate via `x-tenant-id` header.
 */
export function tenantIdFromReq(req: AuthedRequest): string {
  const headerTid = req.headers['x-tenant-id'];
  if (req.user?.kind === 'SUPER_ADMIN' && typeof headerTid === 'string' && headerTid) {
    return headerTid;
  }
  const tid = req.user?.tid;
  if (!tid) throw new ForbiddenException('no tenant in token');
  return tid;
}
