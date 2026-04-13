import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();

async function main() {
  // Find all chunks mentioning Tagell
  const chunks = await p.documentChunk.findMany({
    where: { content: { contains: 'Tagell', mode: 'insensitive' } },
    select: { chunkIndex: true, pageNumber: true, content: true }
  });
  console.log('Tagell chunks:', chunks.length);
  for (const c of chunks) {
    console.log(`--- chunkIdx ${c.chunkIndex} page ${c.pageNumber} ---`);
    console.log(c.content);
    console.log();
  }

  // Also check for calorie/health/benefit mentions near date palm food
  const healthChunks = await p.documentChunk.findMany({
    where: { OR: [
      { content: { contains: 'calori', mode: 'insensitive' } },
      { content: { contains: 'health benefit', mode: 'insensitive' } },
      { content: { contains: 'nutritional', mode: 'insensitive' } },
      { content: { contains: 'phenolic', mode: 'insensitive' } },
      { content: { contains: 'antioxidant', mode: 'insensitive' } },
    ]},
    select: { chunkIndex: true, pageNumber: true, content: true }
  });
  console.log('\n=== Health/calorie/nutritional chunks:', healthChunks.length, '===');
  for (const c of healthChunks) {
    console.log(`--- chunkIdx ${c.chunkIndex} page ${c.pageNumber} ---`);
    console.log(c.content.substring(0, 300));
    console.log();
  }
}

main().then(() => process.exit(0));
