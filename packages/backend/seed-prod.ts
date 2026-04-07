import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const email = process.env.SEED_EMAIL || 'client@kiadp.ai';
  const password = process.env.SEED_PASSWORD || 'Client@KIADP2026';
  const fullName = process.env.SEED_NAME || 'KIADP Client';
  const role = (process.env.SEED_ROLE as 'CLIENT' | 'ADMIN') || 'CLIENT';

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`✅ User already exists: ${email}`);
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const user = await prisma.user.create({
    data: { email, passwordHash, fullName, role, isActive: true },
  });

  console.log(`✅ User created!`);
  console.log(`   Email:    ${user.email}`);
  console.log(`   Password: ${password}`);
  console.log(`   Role:     ${user.role}`);
}

main()
  .catch((e) => { console.error('❌ Failed:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
