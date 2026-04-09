import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const chunks = await prisma.documentChunk.findMany({
    where: { content: { contains: 'Itfunast' } },
    take: 1
  });
  console.log(JSON.stringify(chunks, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
