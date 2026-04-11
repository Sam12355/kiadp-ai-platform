import { PrismaClient } from '@prisma/client';
import { getEnv } from './env.js';

let prisma: PrismaClient | null = null;

export function getPrisma(): PrismaClient {
  if (prisma) return prisma;

  const env = getEnv();

  prisma = new PrismaClient({
    log: env.NODE_ENV === 'development'
      ? ['query', 'warn', 'error']
      : ['warn', 'error'],
  });

  return prisma;
}

/** Ensure pgvector extension and embedding column exist (idempotent). Call once at startup. */
export async function ensurePgVector(): Promise<void> {
  const p = getPrisma();
  await p.$executeRawUnsafe('CREATE EXTENSION IF NOT EXISTS vector');
  // Add embedding column if it doesn't exist (Prisma can't manage Unsupported types via db push)
  await p.$executeRawUnsafe(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'document_chunks' AND column_name = 'embedding'
      ) THEN
        ALTER TABLE document_chunks ADD COLUMN embedding vector(1536);
      END IF;
    END $$;
  `);
}

export async function disconnectPrisma(): Promise<void> {
  if (prisma) {
    await prisma.$disconnect();
    prisma = null;
  }
}
