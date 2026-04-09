import { PrismaClient } from '@prisma/client';
import fs from 'fs';
const prisma = new PrismaClient();

async function main() {
  const chunks = await prisma.documentChunk.findMany({
    where: { 
      OR: [
        { content: { contains: 'interstitial' } },
        { content: { contains: 'Miocene' } }
      ]
    },
    include: { document: true }
  });
  
  const results = chunks.map(c => ({
    source: c.document.originalFilename,
    content: c.content
  }));
  
  fs.writeFileSync('verification_results.json', JSON.stringify(results, null, 2));
  console.log('Results written to verification_results.json');
}

main().catch(console.error).finally(() => prisma.$disconnect());
