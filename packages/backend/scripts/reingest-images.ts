/**
 * Re-ingestion script: deletes all existing chunks + images for the GIAHS document,
 * then re-processes it from scratch using the updated vision prompts (with page text context).
 */
import path from 'path';
import fs from 'fs';
import { PrismaClient } from '@prisma/client';
import { processDocument } from '../src/services/ingestion.service.js';

const p = new PrismaClient();
const BACKEND_DIR = path.resolve(import.meta.dirname, '..');

async function main() {
  const doc = await p.document.findFirst({ where: { originalFilename: { contains: 'GIAHSEGYPT' } } });
  if (!doc) { console.log('Doc not found'); return; }
  const absPath = path.resolve(BACKEND_DIR, doc.filePath!);
  if (!fs.existsSync(absPath)) { console.error('PDF not found at:', absPath); return; }

  console.log('Document:', doc.id, doc.title);
  console.log('PDF path:', absPath);

  // Count existing data
  const oldChunks = await p.documentChunk.count({ where: { documentId: doc.id } });
  const oldImages = await p.documentImage.count({ where: { documentId: doc.id } });
  console.log(`\nExisting data: ${oldChunks} chunks, ${oldImages} images`);

  // Delete existing data (order matters for FK constraints)
  console.log('\nDeleting existing chunks & images...');
  await p.documentChunk.deleteMany({ where: { documentId: doc.id } });
  await p.documentImage.deleteMany({ where: { documentId: doc.id } });
  // Keep documentPages (raw text cache) — processDocument will upsert them
  console.log('Deleted.');

  // Reset document status so processDocument can run
  await p.document.update({ where: { id: doc.id }, data: { status: 'UPLOADED', progress: 0 } });

  // Re-process with updated vision prompts
  console.log('\nRe-processing document...');
  const t0 = Date.now();
  await processDocument(doc.id, absPath);
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

  // Verify
  const newChunks = await p.documentChunk.count({ where: { documentId: doc.id } });
  const newImages = await p.documentImage.count({ where: { documentId: doc.id } });
  const visualChunks = await p.documentChunk.count({ where: { documentId: doc.id, chunkIndex: { gte: 999 } } });
  console.log(`\nDONE in ${elapsed}s — ${newChunks} chunks (${visualChunks} visual), ${newImages} images`);

  // Show sample of new image descriptions
  const sampleImgs = await p.documentImage.findMany({
    where: { documentId: doc.id },
    select: { pageNumber: true, description: true },
    orderBy: { pageNumber: 'asc' },
    take: 10,
  });
  console.log('\nSample image descriptions:');
  for (const img of sampleImgs) {
    console.log(`  p${img.pageNumber}: ${(img.description || '').substring(0, 150)}`);
  }
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
