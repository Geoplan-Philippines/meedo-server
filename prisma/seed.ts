import { auth } from '../src/core/auth/auth';
import { prisma } from '../src/core/database/prisma.client';

const ORG_NAME = 'Geoplan PH';
const ORG_SLUG = 'geoplan-ph';

const ADMIN_NAME = 'Admin';
const ADMIN_EMAIL = 'admin@geoplan.ph';
const ADMIN_PASSWORD = 'admin1234';

const CATEGORIES = ['Hardware', 'Support', 'Customer Service'];
const TEAMS = ['System Developer', 'Marketing', 'Business Development'];

async function main() {
  console.log('Seeding...');

  const org = await prisma.organization.upsert({
    where: { slug: ORG_SLUG },
    update: { name: ORG_NAME },
    create: { name: ORG_NAME, slug: ORG_SLUG },
  });
  console.log('Organization:', org.id);

  let user = await prisma.user.findUnique({ where: { email: ADMIN_EMAIL } });
  if (!user) {
    await auth.api.signUpEmail({
      body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD, name: ADMIN_NAME },
    });
    user = await prisma.user.findUniqueOrThrow({ where: { email: ADMIN_EMAIL } });
  }

  user = await prisma.user.update({
    where: { id: user.id },
    data: { emailVerified: true },
  });
  console.log('User:', user.id);

  await prisma.member.upsert({
    where: { organizationId_userId: { organizationId: org.id, userId: user.id } },
    update: { role: 'owner' },
    create: { organizationId: org.id, userId: user.id, role: 'owner' },
  });
  console.log('Member linked');

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
  console.log(`Login -> ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
