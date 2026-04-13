import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();

async function main() {
  const imgs = await p.documentImage.findMany({
    select: { id: true, pageNumber: true, width: true, height: true, description: true },
    orderBy: { pageNumber: 'asc' }
  });
  console.log('Total images:', imgs.length);

  const byPage = new Map<number, typeof imgs>();
  for (const i of imgs) {
    if (!byPage.has(i.pageNumber)) byPage.set(i.pageNumber, []);
    byPage.get(i.pageNumber)!.push(i);
  }
  for (const [page, images] of byPage) {
    console.log(`\nPage ${page}: ${images.length} images`);
    for (const i of images) {
      console.log(`  ${i.width || '?'}x${i.height || '?'} - ${(i.description || '').substring(0, 150)}`);
    }
  }
}
main().then(() => process.exit(0));
