import { getPrisma } from '../src/config/database.js';

async function main() {
  const prisma = await getPrisma();
  const docs = await prisma.document.findMany({
    select: { id: true, title: true, originalFilename: true, storedFilename: true, status: true },
  });
  console.log(JSON.stringify(docs, null, 2));
  process.exit(0);
}
main();
