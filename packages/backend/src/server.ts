import 'dotenv/config';

// ── BigInt Serialization Patch ──
// Prisma returns BigInt for certain DB fields, but JSON.stringify doesn't know how to handle it.
(BigInt.prototype as any).toJSON = function () {
  return Number(this);
};

import { createApp } from './app.js';
import { getEnv } from './config/env.js';
import { getLogger } from './utils/logger.js';
import { disconnectPrisma } from './config/database.js';
import fs from 'node:fs';

async function main() {
  const env = getEnv();
  const logger = getLogger();

  // Ensure uploads directory exists
  if (!fs.existsSync(env.UPLOAD_DIR)) {
    fs.mkdirSync(env.UPLOAD_DIR, { recursive: true });
    logger.info(`Created upload directory: ${env.UPLOAD_DIR}`);
  }

  const app = createApp();
  
  // Enable trust proxy for Render.com to support rate limiting via X-Forwarded-For
  app.set('trust proxy', 1);

  const server = app.listen(env.PORT, () => {
    logger.info(`🌴 Khalifa Knowledge API running on port ${env.PORT}`);
    logger.info(`📚 API docs: http://localhost:${env.PORT}/api/docs`);
    logger.info(`Environment: ${env.NODE_ENV}`);
  });

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    logger.info(`Received ${signal}, shutting down gracefully...`);
    server.close(async () => {
      await disconnectPrisma();
      logger.info('Server shut down');
      process.exit(0);
    });

    // Force shutdown after 10s
    setTimeout(() => {
      logger.error('Forced shutdown after timeout');
      process.exit(1);
    }, 10_000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
