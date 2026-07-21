import { Request, Response, NextFunction } from 'express';
import { ForbiddenError, UnauthorizedError } from '../utils/errors.js';
import type { UserRole } from '@khalifa/shared';
import { getPrisma } from '../config/database.js';

/**
 * Middleware factory: restricts access to users with specific roles.
 * Must be used AFTER the authenticate middleware.
 */
export function requireRole(...roles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(new UnauthorizedError('Authentication required'));
      return;
    }

    if (!roles.includes(req.user.role as UserRole)) {
      next(new ForbiddenError('Insufficient permissions'));
      return;
    }

    next();
  };
}

// ── Tenant scoping ──
//
// There is no SUPER_ADMIN role. A "super admin" is an ADMIN whose tenantId is
// null; an "institution admin" is an ADMIN attached to a tenant. That convention
// is load-bearing, so it is resolved in exactly one place here rather than being
// re-derived at each call site.
//
// The tenantId is not carried in the JWT, so it costs one lookup per request.
// resolveTenantContext caches the result on the request, and every guard below
// reuses it rather than querying again.

declare global {
  namespace Express {
    interface Request {
      /** Caller's tenant. null for a super admin (platform-wide access). */
      callerTenantId?: string | null;
      /** True when the caller is an ADMIN with no tenant, i.e. the platform owner. */
      isSuperAdmin?: boolean;
    }
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Resolves the caller's tenant once and caches it on the request.
 * Must run AFTER authenticate. Every guard below depends on it.
 */
export async function resolveTenantContext(req: Request, _res: Response, next: NextFunction): Promise<void> {
  if (!req.user) {
    next(new UnauthorizedError('Authentication required'));
    return;
  }

  if (req.callerTenantId !== undefined) {
    next();
    return;
  }

  try {
    const user = await getPrisma().user.findUnique({
      where: { id: req.user.userId },
      select: { tenantId: true, role: true },
    });

    if (!user) {
      next(new UnauthorizedError('Authenticated user no longer exists'));
      return;
    }

    req.callerTenantId = user.tenantId;
    req.isSuperAdmin = user.role === 'ADMIN' && user.tenantId === null;
    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Guards a route whose URL parameter IS a tenant id (e.g. /tenants/:id).
 *
 * Deliberately takes an explicit parameter name: the previous implementation fell
 * back to `req.params.id` on any route, which on /documents/:id compared a document
 * id against a tenant id and denied everything. A guard is only mounted where the
 * parameter genuinely identifies a tenant.
 *
 * Also rejects non-UUID values, so callers cannot reach handlers that interpolate
 * the parameter into SQL.
 */
export function requireTenantParam(paramName: string) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    // Express can surface a repeated path parameter as an array; anything that is not a
    // single string is rejected rather than coerced, so `?id=a&id=b` cannot slip through.
    const raw = req.params[paramName];
    const target = typeof raw === 'string' ? raw : undefined;

    if (!target || !UUID_RE.test(target)) {
      next(new ForbiddenError('Invalid institution identifier'));
      return;
    }

    // Super admin reaches every institution.
    if (req.isSuperAdmin) {
      next();
      return;
    }

    if (target !== req.callerTenantId) {
      next(new ForbiddenError('Access denied: resource belongs to a different institution'));
      return;
    }

    next();
  };
}

/** Restricts a route to the platform owner (ADMIN with no tenant). */
export function requireSuperAdmin(req: Request, _res: Response, next: NextFunction): void {
  if (!req.isSuperAdmin) {
    next(new ForbiddenError('This action is restricted to platform administrators'));
    return;
  }
  next();
}

/**
 * Returns the tenant filter a list query should apply for this caller:
 * `{}` for a super admin (everything), `{ tenantId }` for an institution admin.
 *
 * Guards protect inbound identifiers; they do nothing for endpoints that leak rows
 * in the response. List handlers must spread this into their `where` clause.
 */
export function tenantScope(req: Request): { tenantId?: string } {
  return req.isSuperAdmin ? {} : { tenantId: req.callerTenantId ?? undefined };
}
