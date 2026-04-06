import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // ── Create demo admin user ──
  const adminPasswordHash = await bcrypt.hash('admin123', 12);
  const admin = await prisma.user.upsert({
    where: { email: 'admin@khalifa.ae' },
    update: {},
    create: {
      email: 'admin@khalifa.ae',
      passwordHash: adminPasswordHash,
      fullName: 'Platform Admin',
      role: 'ADMIN',
      isActive: true,
    },
  });
  console.log(`  ✅ Admin user: ${admin.email} (password: admin123)`);

  // ── Create demo client user ──
  const clientPasswordHash = await bcrypt.hash('client123', 12);
  const client = await prisma.user.upsert({
    where: { email: 'client@khalifa.ae' },
    update: {},
    create: {
      email: 'client@khalifa.ae',
      passwordHash: clientPasswordHash,
      fullName: 'Demo Client',
      role: 'CLIENT',
      isActive: true,
    },
  });
  console.log(`  ✅ Client user: ${client.email} (password: client123)`);

  console.log('🌱 Seeding complete!');
}

main()
  .catch((e) => {
    console.error('Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
