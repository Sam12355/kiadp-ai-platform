/**
 * Backfill pgvector embeddings for existing document chunks that have no embedding yet.
 * Reads content from PostgreSQL, generates embeddings via OpenAI, stores in the embedding column.
 * Safe to re-run: only processes chunks where embedding IS NULL.
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import OpenAI from 'openai';

const prisma = new PrismaClient();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const EMBEDDING_MODEL = process.env.OPENAI_EMBEDDING_MODEL ?? 'text-embedding-3-small';
const BATCH_SIZE = 100;

async function main() {
  const [{ count }] = await prisma.$queryRaw<[{ count: bigint }]>`
    SELECT COUNT(*) AS count FROM document_chunks WHERE embedding IS NULL
  `;
  const total = Number(count);
  console.log(`Chunks needing embeddings: ${total}`);
  if (total === 0) {
    console.log('Nothing to do.');
    return;
  }

  let processed = 0;

  while (true) {
    const batch = await prisma.$queryRaw<{ id: string; content: string }[]>`
      SELECT id, content FROM document_chunks
      WHERE embedding IS NULL
      ORDER BY id
      LIMIT ${BATCH_SIZE}
    `;

    if (batch.length === 0) break;

    const texts = batch.map(c => c.content);
    const embeddingResponse = await openai.embeddings.create({
      model: EMBEDDING_MODEL,
      input: texts,
    });

    for (let i = 0; i < batch.length; i++) {
      const vector = embeddingResponse.data[i].embedding;
      const vectorStr = `[${vector.join(',')}]`;
      await prisma.$executeRaw`
        UPDATE document_chunks
        SET embedding = ${vectorStr}::vector
        WHERE id = ${batch[i].id}::uuid
      `;
    }

    processed += batch.length;
    // NOTE: offset stays at 0 because processed rows no longer match WHERE embedding IS NULL
    const pct = Math.round((processed / total) * 100);
    console.log(`Progress: ${processed}/${total} (${pct}%)`);

    // Throttle to avoid OpenAI rate limits
    if (batch.length === BATCH_SIZE) {
      await new Promise(r => setTimeout(r, 200));
    }
  }

  console.log(`Done. Embedded ${processed} chunks.`);
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
