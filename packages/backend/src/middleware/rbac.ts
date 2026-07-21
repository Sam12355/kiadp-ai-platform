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

/**
 * Middleware: ensures institution admins can only access their own tenant.
 * Super admins (tenantId = null) are allowed through unconditionally.
 * Checks req.params.tenantId, then req.params.id, then req.body.tenantId.
 * Must be used AFTER authenticate middleware.
 */
export function requireSameTenant(req: Request, _res: Response, next: NextFunction): void {
  if (!req.user) {
    next(new UnauthorizedError('Authentication required'));
    return;
  }

  const prisma = getPrisma();
  const userId = req.user.userId;

  prisma.user.findUnique({ where: { id: userId }, select: { tenantId: true } })
    .then((user) => {
      // Super admin — no tenant restriction
      if (!user?.tenantId) {
        next();
        return;
      }

      const targetTenantId = req.params.tenantId ?? req.params.id ?? req.body?.tenantId;

      if (targetTenantId && targetTenantId !== user.tenantId) {
        next(new ForbiddenError('Access denied: resource belongs to a different institution'));
        return;
      }

      // Attach tenantId to request for downstream handlers
      (req as any).tenantId = user.tenantId;
      next();
    })
    .catch(next);
}
