import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const p = new PrismaClient();

async function main() {
  const imgs = await p.documentImage.findMany({
    select: { pageNumber: true, description: true },
    orderBy: { pageNumber: 'asc' }
  });
  
  for (const i of imgs) {
    const desc = (i.description || 'NO DESC').substring(0, 250);
    const fig = desc.match(/[Ff]igure\s*\d+/g);
    console.log(`p${i.pageNumber} [${i.imageType}] fig=${fig || 'none'}: ${desc}`);
    console.log('---');
  }
  
  // Also check visual chunks mentioning "pollinat" or "figure 9"
  const pollChunks = await p.documentChunk.findMany({
    where: { OR: [
      { content: { contains: 'pollinat', mode: 'insensitive' } },
      { content: { contains: 'Figure 9', mode: 'insensitive' } },
      { content: { contains: 'Figure 13', mode: 'insensitive' } },
      { content: { contains: 'Figure 14', mode: 'insensitive' } },
    ]},
    select: { pageNumber: true, chunkIndex: true, content: true },
    take: 20
  });
  console.log('\n=== Chunks mentioning pollination / figures 9,13,14 ===');
  for (const c of pollChunks) {
    console.log(`chunk ${c.chunkIndex} p${c.pageNumber}: ${c.content.substring(0, 300)}`);
    console.log('---');
  }
}

main().then(() => process.exit(0));
