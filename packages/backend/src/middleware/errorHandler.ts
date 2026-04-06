import { Request, Response, NextFunction } from 'express';
import { AppError, ValidationError } from '../utils/errors.js';
import { getLogger } from '../utils/logger.js';
import { getEnv } from '../config/env.js';
import type { ApiResponse } from '@khalifa/shared';

export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const logger = getLogger();
  const env = getEnv();

  // Handle known operational errors
  if (err instanceof AppError) {
    if (err.statusCode >= 500) {
      logger.error({ err, code: err.code }, err.message);
    } else {
      logger.warn({ code: err.code, statusCode: err.statusCode }, err.message);
    }

    const response: ApiResponse = {
      success: false,
      error: {
        code: err.code,
        message: err.message,
        ...(err instanceof ValidationError ? { details: err.details } : {}),
      },
    };

    res.status(err.statusCode).json(response);
    return;
  }

  // Handle unexpected errors — don't leak details
  logger.error({ err }, 'Unhandled error');

  const response: ApiResponse = {
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: env.NODE_ENV === 'development'
        ? err.message
        : 'An unexpected error occurred',
    },
  };

  res.status(500).json(response);
}
