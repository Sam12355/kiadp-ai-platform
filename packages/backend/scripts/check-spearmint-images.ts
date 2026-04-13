import { PrismaClient } from '@prisma/client';

const VISUAL_KEYWORDS = /\b(chart|graph|table|figure|map|diagram|infograph|photograph|photo|image\s+shows?|depicts?|illustrat|plot|bar\s+chart|pie\s+chart|scatter|histogram|satellite|aerial|schematic|specimen|cultivation|disease|pest|logo|flag|coat\s+of\s+arms|bowl|glass\s+bowl|paste)\b/i;

async function main() {
  const p = new PrismaClient();
  
  // Find chunks with spearmint/Mentha content to get page numbers
  const chunks = await p.documentChunk.findMany({
    where: { OR: [
      { content: { contains: 'spearmint', mode: 'insensitive' } },
      { content: { contains: 'Mentha spicata', mode: 'insensitive' } },
    ]},
    select: { pageNumber: true, documentId: true, chunkIndex: true, content: true },
    take: 10
  });
  console.log('Spearmint chunks:', chunks.length);
  for (const c of chunks) console.log('  chunk', c.chunkIndex, 'page', c.pageNumber, ':', c.content.slice(0, 150));

  const pages = [...new Set(chunks.map(c => c.pageNumber))];
  const docId = chunks[0]?.documentId;
  console.log('\nPages with spearmint:', pages, 'docId:', docId);

  if (docId) {
    const imgs = await p.documentImage.findMany({
      where: { documentId: docId, pageNumber: { in: pages } },
      select: { id: true, pageNumber: true, description: true, filePath: true }
    });
    console.log('\nImages on spearmint pages:', imgs.length);
    for (const i of imgs) {
      console.log('  p' + i.pageNumber + ':', i.description?.slice(0, 250));
      console.log('    matches VISUAL_KEYWORDS:', VISUAL_KEYWORDS.test(i.description ?? ''));
    }

    // Also check visual chunks (chunkIndex >= 999) for these pages
    const visChunks = await p.documentChunk.findMany({
      where: { documentId: docId, pageNumber: { in: pages }, chunkIndex: { gte: 999 } },
      select: { chunkIndex: true, pageNumber: true, content: true, pineconeVectorId: true }
    });
    console.log('\nVisual chunks on spearmint pages:', visChunks.length);
    for (const v of visChunks) console.log('  chunk', v.chunkIndex, 'page', v.pageNumber, 'vectorId:', v.pineconeVectorId?.slice(0, 30), ':', v.content.slice(0, 150));

    // Check nearby pages (±2)
    const nearby = [...new Set(pages.flatMap(p => [p-2, p-1, p, p+1, p+2]))];
    const nearImgs = await p.documentImage.findMany({
      where: { documentId: docId, pageNumber: { in: nearby } },
      select: { id: true, pageNumber: true, description: true }
    });
    console.log('\nNearby images (±2 pages):', nearImgs.length);
    for (const i of nearImgs) {
      console.log('  p' + i.pageNumber + ' [match:' + VISUAL_KEYWORDS.test(i.description ?? '') + ']:', i.description?.slice(0, 200));
    }
  }

  await p.$disconnect();
}

main();
