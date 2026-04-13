import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();

async function main() {
  const doc = await p.document.findFirst({ where: { originalFilename: { contains: 'GIAHSEGYPT' } } });
  console.log('Status:', doc?.status, 'Progress:', doc?.progress);
  const chunks = await p.documentChunk.count({ where: { documentId: doc!.id } });
  const visChunks = await p.documentChunk.count({ where: { documentId: doc!.id, chunkIndex: { gte: 999 } } });
  const imgs = await p.documentImage.count({ where: { documentId: doc!.id } });
  console.log('Chunks:', chunks, '(visual:', visChunks, ') Images:', imgs);

  const mintImgs = await p.documentImage.findMany({
    where: { documentId: doc!.id, pageNumber: { in: [20, 21, 22, 23] } },
    select: { pageNumber: true, description: true },
    orderBy: { pageNumber: 'asc' }
  });
  console.log('\nMint-area image descriptions (pages 20-23):');
  for (const i of mintImgs) console.log('  p' + i.pageNumber + ':', (i.description || '').substring(0, 280));

  // Also check dish-related images  
  const dishImgs = await p.documentImage.findMany({
    where: { documentId: doc!.id, pageNumber: { in: [14, 15, 16] } },
    select: { pageNumber: true, description: true },
    orderBy: { pageNumber: 'asc' }
  });
  console.log('\nDish-area image descriptions (pages 14-16):');
  for (const i of dishImgs) console.log('  p' + i.pageNumber + ':', (i.description || '').substring(0, 280));
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
