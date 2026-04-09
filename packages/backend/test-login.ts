import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
async function main() {
  const user = await p.user.findUnique({ where: { email: 'admin@khalifa.ae' } });
  if (!user) { console.log('User not found'); return; }
  console.log('Hash:', user.passwordHash);
  const ok = await bcrypt.compare('admin123', user.passwordHash);
  console.log('bcryptjs compare result:', ok);
  await p.$disconnect();
}
main().catch(console.error);
