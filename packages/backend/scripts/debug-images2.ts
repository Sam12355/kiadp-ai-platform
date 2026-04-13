import { PrismaClient } from '@prisma/client';
import OpenAI from 'openai';

const p = new PrismaClient();
const openai = new OpenAI();

async function main() {
  // Embed the actual user query
  const query = "Show me photos of spearmint plant";
  const embResp = await openai.embeddings.create({ model: 'text-embedding-3-small', input: query });
  const qVec = embResp.data[0].embedding;
  const vecStr = `[${qVec.join(',')}]`;

  // Find ALL visual chunks and their similarity to the actual query
  const results = await p.$queryRawUnsafe<any[]>(`
    SELECT dc.id, dc.page_number, dc.chunk_index,
           1 - (dc.embedding <=> '${vecStr}'::vector) AS similarity,
           LEFT(dc.content, 200) as preview
    FROM document_chunks dc
    WHERE dc.embedding IS NOT NULL
      AND dc.chunk_index >= 999
    ORDER BY similarity DESC
    LIMIT 15
  `);
  
  console.log('Visual chunks ranked by similarity to: "' + query + '"');
  for (const r of results) {
    console.log('  sim=' + Number(r.similarity).toFixed(4) + ' p' + r.page_number + ': ' + r.preview.slice(0, 160));
  }

  // Also show which images are on pages 20-22
  const imgs = await p.documentImage.findMany({
    where: { pageNumber: { in: [20, 21, 22] } },
    select: { id: true, pageNumber: true, description: true }
  });
  console.log('\nImages on pages 20-22:');
  for (const i of imgs) {
    console.log('  p' + i.pageNumber + ': ' + (i.description ?? '').slice(0, 150));
  }
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
