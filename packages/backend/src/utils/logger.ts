import pino from 'pino';
import { getEnv } from '../config/env.js';

let logger: pino.Logger | null = null;

export function getLogger(): pino.Logger {
  if (logger) return logger;

  const env = getEnv();

  logger = pino({
    level: env.LOG_LEVEL,
    transport: env.NODE_ENV === 'development'
      ? {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'SYS:standard',
            ignore: 'pid,hostname',
          },
        }
      : undefined,
    formatters: {
      level(label) {
        return { level: label };
      },
    },
    timestamp: pino.stdTimeFunctions.isoTime,
  });

  return logger;
}

/** Create a child logger with additional context */
export function createChildLogger(bindings: Record<string, unknown>): pino.Logger {
  return getLogger().child(bindings);
}
