import { PrismaClient } from '@prisma/client';

const p = new PrismaClient();

async function main() {
  const rows = await p.documentChunk.findMany({
    where: {
      OR: [
        { content: { contains: 'spearmint', mode: 'insensitive' } },
        { content: { contains: 'Mentha', mode: 'insensitive' } },
        { content: { contains: 'spicata', mode: 'insensitive' } },
        { content: { contains: 'carvone', mode: 'insensitive' } },
        { content: { contains: 'limonene', mode: 'insensitive' } },
      ],
    },
    select: { content: true, pageNumber: true, chunkIndex: true },
    take: 30,
  });
  console.log('Found chunks with spearmint/Mentha/spicata/carvone/limonene:', rows.length);
  for (const r of rows) {
    console.log(`\n--- chunk ${r.chunkIndex} page ${r.pageNumber} ---`);
    console.log(r.content.slice(0, 600));
  }

  // Also search for "mint" more broadly
  const mintRows = await p.documentChunk.findMany({
    where: { content: { contains: 'mint', mode: 'insensitive' } },
    select: { content: true, pageNumber: true, chunkIndex: true },
    take: 20,
  });
  console.log('\n\n=== Chunks containing "mint" ===', mintRows.length);
  for (const r of mintRows) {
    console.log(`\n--- chunk ${r.chunkIndex} page ${r.pageNumber} ---`);
    console.log(r.content.slice(0, 400));
  }
}

main().then(() => process.exit(0));
