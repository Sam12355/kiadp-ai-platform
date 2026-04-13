import { PrismaClient } from '@prisma/client';
import OpenAI from 'openai';

const p = new PrismaClient();
const openai = new OpenAI();

async function main() {
  const emb = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: 'show me a photo of the traditional dish tagellah in siwa',
  });
  const vec = emb.data[0].embedding;
  const vecStr = `[${vec.join(',')}]`;

  const rows: any[] = await p.$queryRawUnsafe(`
    SELECT dc.id, dc.content, dc.page_number, dc.chunk_index,
           1 - (dc.embedding <=> '${vecStr}'::vector) AS similarity
    FROM document_chunks dc
    WHERE dc.embedding IS NOT NULL AND dc.chunk_index >= 999
    ORDER BY dc.embedding <=> '${vecStr}'::vector
    LIMIT 10
  `);

  console.log('Visual chunk results for "show me a photo of the traditional dish tagellah in siwa":');
  for (const r of rows) {
    console.log(`  p${r.page_number} idx=${r.chunk_index} sim=${Number(r.similarity).toFixed(4)}: ${r.content.substring(0, 150)}`);
  }

  // Check which pass the 0.32 threshold
  const passing = rows.filter(r => Number(r.similarity) > 0.32);
  console.log(`\nPassing 0.32 threshold: ${passing.length} of ${rows.length}`);
}

main().then(() => process.exit(0));
