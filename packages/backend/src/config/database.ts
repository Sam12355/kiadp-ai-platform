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

/** Ensure pgvector extension exists (idempotent). Call once at startup. */
export async function ensurePgVector(): Promise<void> {
  const p = getPrisma();
  await p.$executeRawUnsafe('CREATE EXTENSION IF NOT EXISTS vector');
}

export async function disconnectPrisma(): Promise<void> {
  if (prisma) {
    await prisma.$disconnect();
    prisma = null;
  }
}
