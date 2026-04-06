import PgBoss from 'pg-boss';
import { getEnv } from '../config/env.js';
import { getLogger } from '../utils/logger.js';
import { JOB_QUEUES } from './jobs.js';

let startPromise: Promise<PgBoss> | null = null;
let bossInstance: PgBoss | null = null;

export async function getBoss(): Promise<PgBoss> {
  if (startPromise) return startPromise;

  startPromise = (async () => {
    const env = getEnv();
    const logger = getLogger();
    const maskedUrl = env.DATABASE_URL.replace(/\/\/.*@/, '//****:****@');
    logger.debug(`Initializing pg-boss on ${maskedUrl}`);

    // Use full URL but specify schema
    const newBoss = new PgBoss({
      connectionString: env.DATABASE_URL,
      schema: 'pgboss',
      archiveCompletedAfterSeconds: 60 * 60 * 24,
      archiveFailedAfterSeconds: 60 * 60 * 24 * 7,
    });

    newBoss.on('error', error => logger.error({ err: error }, 'pg-boss error'));
    
    await newBoss.start();
    logger.info('📚 pg-boss started successfully in pgboss schema');

    // Explicitly create queues to ensure partitions are created
    try {
        await newBoss.createQueue(JOB_QUEUES.INGEST_DOCUMENT);
        logger.info(`Queue created/verified: ${JOB_QUEUES.INGEST_DOCUMENT}`);
        await newBoss.createQueue(JOB_QUEUES.DELETE_DOCUMENT);
        logger.info(`Queue created/verified: ${JOB_QUEUES.DELETE_DOCUMENT}`);
    } catch (err) {
        logger.error({ err }, 'Failed to create queue partition');
    }

    bossInstance = newBoss;
    return newBoss;
  })();

  return startPromise;
}

export async function stopBoss(): Promise<void> {
  if (bossInstance) {
    await bossInstance.stop();
    bossInstance = null;
    startPromise = null;
  }
}
