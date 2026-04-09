import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const images = await prisma.documentImage.findMany({
    take: 5,
    orderBy: { createdAt: 'desc' },
    select: { description: true, pageNumber: true, document: { select: { title: true } } }
  });
  console.log(JSON.stringify(images, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
