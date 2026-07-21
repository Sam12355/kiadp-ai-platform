import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { getEnv } from '../config/env.js';
import { UnauthorizedError, ForbiddenError } from '../utils/errors.js';
import type { UserRole } from '@khalifa/shared';

export interface AuthPayload {
  userId: string;
  email: string;
  role: UserRole;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthPayload;
    }
  }
}

/**
 * Middleware: verifies JWT access token from Authorization header.
 */
export function authenticate(req: Request, _res: Response, next: NextFunction): void {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedError('Missing or invalid authorization header');
    }

    const token = authHeader.slice(7);
    const env = getEnv();

    const payload = jwt.verify(token, env.JWT_SECRET) as AuthPayload;
    req.user = payload;
    next();
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      next(err);
      return;
    }
    next(new UnauthorizedError('Invalid or expired token'));
  }
}

/**
 * Middleware: asserts that the authenticated user has one of the allowed roles.
 */
export function requireRole(...allowedRoles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(new UnauthorizedError('Not authenticated'));
      return;
    }

    if (!allowedRoles.includes(req.user.role)) {
      // 403, not 401. The caller is authenticated; they are simply not allowed. Answering
      // 401 told the client "your identity is the problem", and the axios interceptor
      // acted on that literally — refreshing the token and, when the refresh did not help,
      // signing the user out. A student hitting an admin route was logged out rather than
      // refused.
      next(new ForbiddenError('Insufficient permissions'));
      return;
    }

    next();
  };
}
