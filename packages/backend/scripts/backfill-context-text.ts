/**
 * Backfill contextText on existing DocumentImage records
 * using the page text stored in DocumentPage.rawText
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function extractImageContext(fullPageText: string, imgIndex: number): string {
  const parts: string[] = [];

  const fullCaptionRegex = /(?:Figure|Fig\.?|Table|Plate)\s+\d+\s*[:.]?\s+[A-Z][^.]{10,150}\./gi;
  const shortRefRegex = /(?:Figure|Fig\.?|Table|Plate)\s+\d+[^.]*\./gi;
  const fullCaptions = fullPageText.match(fullCaptionRegex);
  const shortCaptions = fullPageText.match(shortRefRegex);
  const captions = fullCaptions && fullCaptions.length > 0 ? fullCaptions : shortCaptions;
  if (captions) {
    const caption = captions[imgIndex] ?? captions[0];
    parts.push(caption.trim());
  }

  const paragraphs = fullPageText.split(/\n{2,}|\r?\n(?=[A-Z0-9\u0600-\u06FF])/)
    .map(p => p.trim())
    .filter(p => p.length > 40);

  const figRefRegex = /(?:Figure|Fig\.?|Table|Plate)\s+\d+/i;
  const refParagraphs = paragraphs.filter(p => figRefRegex.test(p));
  const nonRefParagraphs = paragraphs.filter(p => !figRefRegex.test(p) && p.length > 60);

  for (const p of refParagraphs.slice(0, 2)) {
    if (!parts.some(existing => existing.includes(p.substring(0, 50)))) {
      parts.push(p);
    }
  }

  for (const p of nonRefParagraphs.slice(0, 2)) {
    if (!parts.some(existing => existing.includes(p.substring(0, 50)))) {
      parts.push(p);
    }
  }

  let result = parts.join('\n\n');
  if (result.length > 1200) result = result.substring(0, 1200);
  return result;
}

async function main() {
  const images = await prisma.documentImage.findMany({
    select: { id: true, documentId: true, pageNumber: true, contextText: true },
    orderBy: [{ documentId: 'asc' }, { pageNumber: 'asc' }],
  });

  console.log(`Found ${images.length} images to backfill`);

  // Group images by (documentId, pageNumber) to count index for multi-image pages
  const pageGroups = new Map<string, typeof images>();
  for (const img of images) {
    const key = `${img.documentId}:${img.pageNumber}`;
    if (!pageGroups.has(key)) pageGroups.set(key, []);
    pageGroups.get(key)!.push(img);
  }

  let updated = 0;
  let skipped = 0;

  for (const [key, pageImages] of pageGroups) {
    const [documentId, pageNumStr] = key.split(':');
    const pageNumber = parseInt(pageNumStr);

    // Get page text
    const page = await prisma.documentPage.findFirst({
      where: { documentId, pageNumber },
      select: { rawText: true },
    });

    if (!page?.rawText) {
      console.log(`  p${pageNumber}: no page text, skipping ${pageImages.length} image(s)`);
      skipped += pageImages.length;
      continue;
    }

    for (let i = 0; i < pageImages.length; i++) {
      const img = pageImages[i];
      const contextText = extractImageContext(page.rawText, i);

      if (contextText.length > 0) {
        await prisma.documentImage.update({
          where: { id: img.id },
          data: { contextText },
        });
        console.log(`  p${pageNumber} img${i}: stored ${contextText.length} chars of context`);
        console.log(`    preview: ${contextText.substring(0, 120)}...`);
        updated++;
      } else {
        console.log(`  p${pageNumber} img${i}: no context extracted`);
        skipped++;
      }
    }
  }

  console.log(`\nDone! Updated: ${updated}, Skipped: ${skipped}`);
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
