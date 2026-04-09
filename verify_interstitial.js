const { PrismaClient } = require('@prisma/client');
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
  
  console.log(`Found ${chunks.length} chunks.`);
  chunks.forEach(c => {
    console.log(`\n--- Source: ${c.document.originalFilename} ---`);
    console.log(c.content.substring(0, 500) + '...');
  });
}

main().catch(console.error).finally(() => prisma.$disconnect());
