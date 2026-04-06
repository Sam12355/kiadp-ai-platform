import 'dotenv/config';
import { processDocument } from './services/ingestion.service.js';
import { getPrisma } from './config/database.js';

async function testIngestion() {
  const prisma = getPrisma();
  const doc = await prisma.document.findFirst({
    where: { status: 'UPLOADED' },
    orderBy: { createdAt: 'desc' },
  });

  if (!doc) {
    console.log('No UPLOADED documents found.');
    return;
  }

  console.log(`Starting MANUAL ingestion for ${doc.id} (${doc.filePath})`);
  try {
    await processDocument(doc.id, doc.filePath);
    console.log('✅ Ingestion COMPLETED successfully');
  } catch (err) {
    console.error('❌ Ingestion FAILED:', err);
  }
}

testIngestion();
