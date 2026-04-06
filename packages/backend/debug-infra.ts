import { PrismaClient } from '@prisma/client';
import PgBoss from 'pg-boss';
import 'dotenv/config';

const prisma = new PrismaClient();

async function main() {
  console.log('--- DB Check ---');
  const schemas = await prisma.$queryRawUnsafe("SELECT schema_name FROM information_schema.schemata");
  console.log('Schemas in DB:', (schemas as any[]).map(s => s.schema_name));

  const boss = new PgBoss(process.env.DATABASE_URL!);
  await boss.start();
  console.log('pg-boss started.');
  
  const queues = await boss.getQueues();
  console.log('Active Queues:', queues);
  
  // Check jobs specifically in our queue
  // Note: we might need a direct query to see 'created' jobs
  const jobs = await prisma.$queryRawUnsafe("SELECT * FROM pgboss.job WHERE name = 'ingest-document'");
  console.log('Jobs in "ingest-document":', (jobs as any[]).length);
  if ((jobs as any[]).length > 0) {
    console.log('Recent job stats:', (jobs as any[]).slice(0, 1).map(j => ({ id: j.id, state: j.state })));
  }

  await boss.stop();
}

main().finally(() => prisma.$disconnect());
