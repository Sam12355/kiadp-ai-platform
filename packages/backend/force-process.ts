import { PrismaClient } from '@prisma/client';
import { processDocument } from './src/services/ingestion.service.js';
import 'dotenv/config';

const prisma = new PrismaClient();

async function main() {
  console.log('--- FORCED PROCESSING ---');
  const uploadedDocs = await prisma.document.findMany({
    where: { 
      status: { in: ['UPLOADED', 'FAILED'] }
    }
  });

  console.log(`Found ${uploadedDocs.length} documents to process.`);

  for (const doc of uploadedDocs) {
    console.log(`Processing: ${doc.title} (${doc.id})...`);
    try {
      await processDocument(doc.id, doc.filePath);
      console.log(`✅ ${doc.title} successfully vectorized to Pinecone!`);
    } catch (err) {
      console.error(`❌ Failed ${doc.title}:`, err);
    }
  }
}

main().finally(() => prisma.$disconnect());
