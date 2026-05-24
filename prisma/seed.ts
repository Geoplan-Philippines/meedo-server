import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as bcrypt from 'bcryptjs';

import { env } from '../src/core/config/env.config';

const adapter = new PrismaPg({ connectionString: env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('Seeding...');

  const hashedPassword = await bcrypt.hash('Admin@1234', 10);
  const categories = ['Billing', 'Technical Support', 'General Inquiry'];
  const teams = ['Engineering', 'Technical Support', 'Quality Assurance', 'Marketing', 'Operations'];

  await prisma.$transaction(async (tx) => {
    const org = await tx.organization.upsert({
      where: { slug: 'meedo-dev' },
      update: {},
      create: {
        name: 'Meedo Dev',
        slug: 'meedo-dev',
      },
    });
    console.log('Organization:', org.id);

    const user = await tx.user.upsert({
      where: { email: 'admin@meedo.dev' },
      update: {},
      create: {
        name: 'Admin User',
        email: 'admin@meedo.dev',
        emailVerified: true,
      },
    });
    console.log('User:', user.id);

    const existingAccount = await tx.account.findFirst({
      where: { userId: user.id, providerId: 'credential' },
    });
    if (!existingAccount) {
      await tx.account.create({
        data: {
          accountId: user.id,
          providerId: 'credential',
          password: hashedPassword,
          userId: user.id,
        },
      });
    }
    console.log('Account seeded');

    await tx.member.upsert({
      where: {
        organizationId_userId: {
          organizationId: org.id,
          userId: user.id,
        },
      },
      update: {},
      create: {
        organizationId: org.id,
        userId: user.id,
        role: 'owner',
      },
    });
    console.log('Member linked');

    for (const name of categories) {
      await tx.ticketCategory.upsert({
        where: {
          organizationId_name: {
            organizationId: org.id,
            name,
          },
        },
        update: {},
        create: {
          name,
          description: `${name} tickets`,
          organizationId: org.id,
        },
      });
    }
    console.log('Ticket categories seeded');

    for (const name of teams) {
      await tx.team.upsert({
        where: {
          organizationId_name: {
            organizationId: org.id,
            name,
          },
        },
        update: {},
        create: {
          name,
          description: `${name} team`,
          organizationId: org.id,
        },
      });
    }
    console.log('Teams seeded');
  });

  console.log('Done.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
