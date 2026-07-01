import { auth } from '../src/core/auth/auth';
import { prisma } from '../src/core/database/prisma.client';

const ORG_NAME = 'Geoplan Philippines Inc.';
const ORG_SLUG = 'geoplan-philippines-inc';

const CATEGORIES = ['Hardware', 'Support', 'Customer Service'];
const TEAMS = ['IT / System Developer', 'Business Development Group'];

async function seedOrgUser(
  orgId: string,
  { email, password, name, role }: { email: string; password: string; name: string; role: string },
) {
  let user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    await auth.api.signUpEmail({ body: { email, password, name } });
    user = await prisma.user.findUniqueOrThrow({ where: { email } });
  }
  user = await prisma.user.update({ where: { id: user.id }, data: { emailVerified: true } });
  await prisma.member.upsert({
    where: { organizationId_userId: { organizationId: orgId, userId: user.id } },
    update: { role },
    create: { organizationId: orgId, userId: user.id, role },
  });
  return user;
}

async function main() {
  console.log('Seeding...');

  const org = await prisma.organization.upsert({
    where: { slug: ORG_SLUG },
    update: { name: ORG_NAME },
    create: { name: ORG_NAME, slug: ORG_SLUG },
  });
  console.log('Organization:', org.id);

  const user = await seedOrgUser(org.id, {
    email: 'admin@geoplanph.com',
    password: 'admin123',
    name: 'Admin',
    role: 'owner',
  });
  console.log('Admin user:', user.id);

  const normalUser = await seedOrgUser(org.id, {
    email: 'user@geoplanph.com',
    password: 'user123456',
    name: 'User',
    role: 'member',
  });
  console.log('Normal user:', normalUser.id);

  for (const name of CATEGORIES) {
    await prisma.ticketCategory.upsert({
      where: { organizationId_name: { organizationId: org.id, name } },
      update: {},
      create: {
        name,
        description: `${name} tickets`,
        organizationId: org.id,
      },
    });
  }
  console.log('Ticket categories seeded');

  for (const name of TEAMS) {
    const team = await prisma.team.upsert({
      where: { organizationId_name: { organizationId: org.id, name } },
      update: {},
      create: { name, organizationId: org.id },
    });

    await prisma.teamMember.upsert({
      where: { teamId_userId: { teamId: team.id, userId: user.id } },
      update: {},
      create: { teamId: team.id, userId: user.id },
    });
  }
  console.log('Teams seeded');

  console.log('Done.');
  console.log(`Admin login -> admin@geoplanph.com / admin123`);
  console.log(`User login  -> user@geoplanph.com / user123456`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
