import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as bcrypt from 'bcryptjs';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('Seeding...');

  const org = await prisma.organization.upsert({
    where: { slug: 'meedo-dev' },
    update: {},
    create: {
      name: 'Meedo Dev',
      slug: 'meedo-dev',
    },
  });
  console.log('Organization:', org.id);

  const user = await prisma.user.upsert({
    where: { email: 'admin@meedo.dev' },
    update: {},
    create: {
      name: 'Admin User',
      email: 'admin@meedo.dev',
      emailVerified: true,
    },
  });
  console.log('User:', user.id);

  const hashedPassword = await bcrypt.hash('Admin@1234', 10);

  await prisma.account.upsert({
    where: { id: 'seed-account-admin' },
    update: {},
    create: {
      id: 'seed-account-admin',
      accountId: user.id,
      providerId: 'credential',
      password: hashedPassword,
      userId: user.id,
    },
  });
  console.log('Account seeded');

  await prisma.member.upsert({
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

  const categories = ['Billing', 'Technical Support', 'General Inquiry'];
  for (const name of categories) {
    await prisma.ticketCategory.upsert({
      where: {
        id: `seed-category-${name.toLowerCase().replace(/ /g, '-')}`,
      },
      update: {},
      create: {
        id: `seed-category-${name.toLowerCase().replace(/ /g, '-')}`,
        name,
        description: `${name} tickets`,
        organizationId: org.id,
      },
    });
  }
  console.log('Ticket categories seeded');

  const teams = ['Engineering', 'Technical Support', 'Quality Assurance', 'Marketing', 'Operations'];
  for (const name of teams) {
    await prisma.team.upsert({
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