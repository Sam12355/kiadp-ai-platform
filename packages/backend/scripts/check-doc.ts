import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';

async function main() {
  const p = new PrismaClient();
  const doc = await p.document.findFirst({ where: { originalFilename: { contains: 'GIAHSEGYPT' } } });
  if (!doc) { console.log('Document not found'); process.exit(1); }
  console.log('filePath:', doc.filePath);
  console.log('storedFilename:', doc.storedFilename);
  console.log('status:', doc.status);
  
  // Check if local file exists
  const localExists = fs.existsSync(doc.filePath);
  console.log('Local file exists:', localExists);
  
  // Check uploads directory
  const uploadsDir = path.resolve('uploads');
  if (fs.existsSync(uploadsDir)) {
    const files = fs.readdirSync(uploadsDir).filter(f => f.endsWith('.pdf'));
    console.log('PDFs in uploads:', files);
  }
  
  // Check chunk/image counts
  const chunks = await p.documentChunk.count({ where: { documentId: doc.id } });
  const images = await p.documentImage.count({ where: { documentId: doc.id } });
  console.log('Chunks:', chunks, 'Images:', images);
  
  await p.$disconnect();
}
main();
