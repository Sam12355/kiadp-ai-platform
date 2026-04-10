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
import { setupVoiceBridge } from './services/voice.service.js';
import { getBoss } from './queue/boss.js';
import { JOB_QUEUES, type IngestDocumentPayload } from './queue/jobs.js';
import { processDocument } from './services/ingestion.service.js';
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

  setupVoiceBridge(server);

  // ── Inline Worker (pg-boss job processing) ──
  const boss = await getBoss();

  await boss.work(JOB_QUEUES.INGEST_DOCUMENT, async (jobs) => {
    const jobArray = Array.isArray(jobs) ? jobs : [jobs];
    for (const job of jobArray) {
      const payload = job.data as unknown as IngestDocumentPayload;
      logger.info(`[worker] Picked up ingest job for document: ${payload.documentId}`);
      try {
        await processDocument(payload.documentId, payload.filePath);
        logger.info(`[worker] Ingest job succeeded for ${payload.documentId}`);
      } catch (error) {
        logger.error({ err: error }, `[worker] Ingest job failed for ${payload.documentId}`);
        throw error;
      }
    }
  });

  await boss.work(JOB_QUEUES.DELETE_DOCUMENT, async (jobs) => {
    const jobArray = Array.isArray(jobs) ? jobs : [jobs];
    for (const job of jobArray) {
      const payload = job.data as any;
      logger.info(`[worker] Picked up delete job for document: ${payload.documentId}`);
      try {
        const { deleteDocument: deleteDocService } = await import('./services/ingestion.service.js');
        await deleteDocService(payload.documentId, payload.pineconeVectorIds);
        logger.info(`[worker] Delete job succeeded for ${payload.documentId}`);
      } catch (error) {
        logger.error({ err: error }, `[worker] Delete job failed for ${payload.documentId}`);
        throw error;
      }
    }
  });

  logger.info('✅ Inline worker registered — listening for ingest/delete jobs');

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    logger.info(`Received ${signal}, shutting down gracefully...`);
    await boss.stop();
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
