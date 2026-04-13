import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();

async function main() {
  // Get images on pages 26 (Fig 9), 27 (Fig 10), 29 (Fig 11)
  const imgs = await p.documentImage.findMany({
    where: { pageNumber: { in: [26, 27, 29] } },
    select: { pageNumber: true, contextText: true, description: true },
    orderBy: { pageNumber: 'asc' },
  });

  for (const i of imgs) {
    console.log('========== PAGE ' + i.pageNumber + ' ==========');
    console.log('DESCRIPTION:', (i.description || 'NULL'));
    console.log('');
    console.log('CONTEXT_TEXT:', (i.contextText || 'NULL'));
    console.log('');
  }

  // Also check what text chunks exist on these pages
  const chunks = await p.documentChunk.findMany({
    where: { pageNumber: { in: [26, 27, 29] }, chunkIndex: { lt: 999 } },
    select: { pageNumber: true, chunkIndex: true, content: true },
    orderBy: [{ pageNumber: 'asc' }, { chunkIndex: 'asc' }],
  });

  console.log('\n========== TEXT CHUNKS ON THESE PAGES ==========');
  for (const c of chunks) {
    console.log(`--- p${c.pageNumber} chunk ${c.chunkIndex} ---`);
    console.log(c.content.substring(0, 400));
    console.log('');
  }

  process.exit(0);
}
main();
