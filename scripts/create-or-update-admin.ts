import argon2 from 'argon2';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const email = 'admin@example.com';
  const password = 'Adora123';
  const name = 'Adora Admin';
  const phone = '9999999999';

  console.log(`[Admin Setup] Generating Argon2 hash for password...`);
  const passwordHash = await argon2.hash(password);

  // Check if admin user exists by email or phone
  const existingUser = await prisma.user.findFirst({
    where: {
      OR: [
        { email },
        { phone }
      ]
    }
  });

  let user;
  if (existingUser) {
    console.log(`[Admin Setup] Updating existing user (${existingUser.id}, email: ${existingUser.email})...`);
    user = await prisma.user.update({
      where: { id: existingUser.id },
      data: {
        role: 'ADMIN',
        name,
        email,
        phone: existingUser.phone || phone,
        passwordHash,
        refreshTokenHash: null,
        tokenVersion: { increment: 1 }
      }
    });
    console.log(`[Admin Setup] Successfully updated admin account.`);
  } else {
    console.log(`[Admin Setup] Creating new admin account...`);
    user = await prisma.user.create({
      data: {
        role: 'ADMIN',
        name,
        email,
        phone,
        passwordHash,
        tokenVersion: 0
      }
    });
    console.log(`[Admin Setup] Successfully created new admin account (${user.id}).`);
  }

  // Verify the password works
  const isValid = await argon2.verify(user.passwordHash, password);
  console.log(`[Admin Setup] Credentials verification:`, isValid ? 'PASSED ✅' : 'FAILED ❌');
  console.log(`[Admin Setup] Email: ${user.email}`);
  console.log(`[Admin Setup] Role: ${user.role}`);
}

main()
  .catch((e) => {
    console.error('[Admin Setup] Error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
