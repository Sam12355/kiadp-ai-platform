import path from 'path';
import { PrismaClient } from '@prisma/client';
import { Pinecone } from '@pinecone-database/pinecone';
import { processDocument } from '../src/services/ingestion.service.js';

const p = new PrismaClient();
const BACKEND_DIR = path.resolve(import.meta.dirname, '..');

async function main() {
  const doc = await p.document.findFirst({ where: { originalFilename: { contains: 'GIAHSEGYPT' } } });
  if (!doc) { console.log('Doc not found'); return; }
  const absPath = path.resolve(BACKEND_DIR, doc.filePath!);
  console.log('Document:', doc.id, doc.title);
  console.log('File:', absPath);

  // 1. Collect Pinecone vector IDs to delete
  const chunks = await p.documentChunk.findMany({
    where: { documentId: doc.id, pineconeVectorId: { not: null } },
    select: { pineconeVectorId: true },
  });
  const vectorIds = chunks.map(c => c.pineconeVectorId!);
  console.log('Pinecone vectors to delete:', vectorIds.length);

  // 2. Delete from Pinecone
  if (vectorIds.length > 0 && process.env.PINECONE_API_KEY && process.env.PINECONE_INDEX_NAME) {
    const pinecone = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });
    const index = pinecone.Index(process.env.PINECONE_INDEX_NAME);
    for (let i = 0; i < vectorIds.length; i += 1000) {
      await index.deleteMany(vectorIds.slice(i, i + 1000));
      console.log(`  Deleted batch ${Math.floor(i / 1000) + 1}`);
    }
    console.log('Pinecone vectors deleted');
  }

  // 3. Delete DB records (onDelete: Cascade handles answer_sources / answer_images)
  const imgCount = await p.documentImage.deleteMany({ where: { documentId: doc.id } });
  console.log('Deleted images:', imgCount.count);

  const chunkCount = await p.documentChunk.deleteMany({ where: { documentId: doc.id } });
  console.log('Deleted chunks:', chunkCount.count);

  // Reset document status
  await p.document.update({
    where: { id: doc.id },
    data: { status: 'UPLOADED', progress: 0 },
  });
  console.log('Document reset to UPLOADED');

  // 4. Re-process
  console.log('Starting re-ingestion...');
  await processDocument(doc.id, absPath);

  const newChunks = await p.documentChunk.count({ where: { documentId: doc.id } });
  const newImgs = await p.documentImage.count({ where: { documentId: doc.id } });
  console.log('DONE - chunks:', newChunks, 'images:', newImgs);
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
