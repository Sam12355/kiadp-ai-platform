import { Request, Response, NextFunction } from 'express';
import { ForbiddenError, UnauthorizedError } from '../utils/errors.js';
import type { UserRole } from '@khalifa/shared';

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
