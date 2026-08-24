import { auth } from '../src/core/auth/auth';
import { prisma } from '../src/core/database/prisma.client';

const ORG_NAME = 'Geoplan Philippines Inc.';
const ORG_SLUG = 'geoplan-philippines-inc';

const ADMIN_NAME = 'Admin';
const ADMIN_EMAIL = 'admin@geoplanph.com';
const ADMIN_PASSWORD = 'admin123';

const MEMBER_NAME = 'Timesheet Member';
const MEMBER_EMAIL = 'member@geoplanph.com';
const MEMBER_PASSWORD = 'member123';

const CATEGORIES = ['Hardware', 'Support', 'Customer Service'];
const TEAMS = ['IT / System Developer', 'Business Development Group'];
const TIMESHEET_CLIENTS = [
  { apptivoId: 'seed-client-001', customerName: 'Geoplan Internal Operations' },
  { apptivoId: 'seed-client-002', customerName: 'Field Survey Support' },
  { apptivoId: 'seed-client-003', customerName: 'Client Documentation' },
];

const TIMESHEET_PROJECTS = [
  {
    apptivoId:       'local-timesheet-wo-001',
    workOrderNumber: 'WO-001',
    clientIndex:     0,
    status:          'Open',
    total:           0,
  },
  {
    apptivoId:       'local-timesheet-wo-002',
    workOrderNumber: 'WO-002',
    clientIndex:     1,
    status:          'Open',
    total:           0,
  },
  {
    apptivoId:       'local-timesheet-wo-003',
    workOrderNumber: 'WO-003',
    clientIndex:     2,
    status:          'Open',
    total:           0,
  },
];

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
  console.log('Admin member linked');

  let memberUser = await prisma.user.findUnique({ where: { email: MEMBER_EMAIL } });
  if (!memberUser) {
    await auth.api.signUpEmail({
      body: { email: MEMBER_EMAIL, password: MEMBER_PASSWORD, name: MEMBER_NAME },
    });
    memberUser = await prisma.user.findUniqueOrThrow({ where: { email: MEMBER_EMAIL } });
  }

  memberUser = await prisma.user.update({
    where: { id: memberUser.id },
    data: { emailVerified: true },
  });
  console.log('Timesheet member user:', memberUser.id);

  await prisma.member.upsert({
    where: { organizationId_userId: { organizationId: org.id, userId: memberUser.id } },
    update: { role: 'member' },
    create: { organizationId: org.id, userId: memberUser.id, role: 'member' },
  });
  console.log('Timesheet member linked');
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

    await prisma.teamMember.upsert({
      where: { teamId_userId: { teamId: team.id, userId: memberUser.id } },
      update: {},
      create: { teamId: team.id, userId: memberUser.id },
    });
  }
  console.log('Teams seeded');

  const clientIds: string[] = [];
  for (const client of TIMESHEET_CLIENTS) {
    const created = await prisma.client.upsert({
      where: { organizationId_apptivoId: { organizationId: org.id, apptivoId: client.apptivoId } },
      update: { customerName: client.customerName },
      create: { ...client, organizationId: org.id },
    });
    clientIds.push(created.id);
  }

  for (const project of TIMESHEET_PROJECTS) {
    await prisma.project.upsert({
      where: { organizationId_apptivoId: { organizationId: org.id, apptivoId: project.apptivoId } },
      update: {
        workOrderNumber: project.workOrderNumber,
        status:          project.status,
        total:           project.total,
        clientId:        clientIds[project.clientIndex],
      },
      create: {
        apptivoId:       project.apptivoId,
        workOrderNumber: project.workOrderNumber,
        status:          project.status,
        total:           project.total,
        reportedDate:    new Date(),
        clientId:        clientIds[project.clientIndex],
        organizationId:  org.id,
      },
    });
  }
  console.log('Timesheet demo projects seeded');

  console.log('Done.');
  console.log(`Admin login -> ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}`);
  console.log(`Member login -> ${MEMBER_EMAIL} / ${MEMBER_PASSWORD}`);
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
