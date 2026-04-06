import 'dotenv/config';
import { getEnv } from './config/env.js';
import { getLogger } from './utils/logger.js';
import { disconnectPrisma } from './config/database.js';
import { getBoss } from './queue/boss.js';
import { JOB_QUEUES, IngestDocumentPayload } from './queue/jobs.js';
import { processDocument } from './services/ingestion.service.js';

async function main() {
  const env = getEnv();
  const logger = getLogger();

  logger.info('🌴 Khalifa Knowledge Worker starting...');
  logger.info(`Environment: ${env.NODE_ENV}`);

  const boss = await getBoss();

  // ── Register Jobs ──

  // 1. Document Ingestion Job
  await boss.work(JOB_QUEUES.INGEST_DOCUMENT, async (jobs) => {
    const jobArray = Array.isArray(jobs) ? jobs : [jobs];
    for (const job of jobArray) {
      const payload = job.data as unknown as IngestDocumentPayload;
      logger.info(`Picked up document for ingestion: ${payload.documentId}`);
      try {
        await processDocument(payload.documentId, payload.filePath);
        logger.info(`Document ingestion job succeeded for ${payload.documentId}`);
      } catch (error) {
        logger.error({ err: error }, `Document ingestion job failed for ${payload.documentId}`);
        throw error; // Let pg-boss handle retries
      }
    }
  });

  // 2. Document Deletion Job
  await boss.work(JOB_QUEUES.DELETE_DOCUMENT, async (jobs) => {
    const jobArray = Array.isArray(jobs) ? jobs : [jobs];
    for (const job of jobArray) {
      const payload = job.data as any; // Type as needed
      logger.info(`Picked up document for deletion: ${payload.documentId}`);
      try {
        const { deleteDocument: deleteDocService } = await import('./services/ingestion.service.js');
        await deleteDocService(payload.documentId, payload.pineconeVectorIds);
        logger.info(`Document deletion job succeeded for ${payload.documentId}`);
      } catch (error) {
        logger.error({ err: error }, `Document deletion job failed for ${payload.documentId}`);
        throw error;
      }
    }
  });

  logger.info('✅ Worker actively polling queues');

  setInterval(() => {
    logger.trace('Worker heartbeat: I am still alive');
  }, 30000);

  // Keep process alive & handle shutdown
  const shutdown = async (signal: string) => {
    logger.info(`Worker received ${signal}, shutting down neatly...`);
    await boss.stop();
    await disconnectPrisma();
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  console.error('Failed to start worker:', err);
  process.exit(1);
});
