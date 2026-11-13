import {
  AttendanceEventType,
  AttendanceOrigin,
  AttendanceSource,
  DayOfWeek,
  TicketActivityType,
  TicketPriority,
  TimesheetEntryStatus,
  TimesheetWorkType,
} from '@prisma/client';
import { hashPassword } from 'better-auth/crypto';
import { createHash } from 'node:crypto';

import { SYSTEM_STATUSES } from '../src/common/constants/statuses.constants';
import { auth } from '../src/core/auth/auth';
import { prisma } from '../src/core/database/prisma.client';
import { assertSafeSeedTarget } from './seed-target';

const ORG_NAME = 'Geoplan Philippines Inc.';
const ORG_SLUG = 'geoplan-philippines-inc';
const DEFAULT_MEMBER_PASSWORD = 'default123';
const DEMO_ID_NAMESPACE = 'meedo-production-demo-seed';
const WORKDAY_COUNT = 10;

const TEAM_SEEDS = [
  {
    name: 'System Developer',
    legacyName: 'IT / System Developer',
    projectName: 'Meedo Platform Improvements',
  },
  {
    name: 'Business Development',
    legacyName: 'Business Development Group',
    projectName: 'Partner Growth Program',
  },
  {
    name: 'Sales',
    projectName: 'Sales Pipeline Enablement',
  },
  {
    name: 'Marketing',
    projectName: 'Product Awareness Campaign',
  },
] as const;

type TeamName = (typeof TEAM_SEEDS)[number]['name'];

interface UserSeed {
  name: string;
  email: string;
  password: string;
  employeeCode: string;
  role: 'member' | 'owner';
  teamName?: TeamName;
}

interface SeededUser {
  id: string;
  memberId: string;
  email: string;
}

const USER_SEEDS: UserSeed[] = [
  {
    name: 'Geoplan Admin',
    email: 'admin@geoplanph.com',
    password: 'admin123',
    employeeCode: 'DEMO-ADMIN-001',
    role: 'owner',
  },
  {
    name: 'Ace Gabriel',
    email: 'acegabriel0809@gmail.com',
    password: 'pogingace',
    employeeCode: 'DEMO-SD-001',
    role: 'member',
    teamName: 'System Developer',
  },
  {
    name: 'Mary Jairelle Mangune',
    email: 'geo.maryjairellemangune@gmail.com',
    password: DEFAULT_MEMBER_PASSWORD,
    employeeCode: 'DEMO-SD-002',
    role: 'member',
    teamName: 'System Developer',
  },
  {
    name: 'Miguel Santos',
    email: 'demo.miguel.santos@geoplanph.com',
    password: DEFAULT_MEMBER_PASSWORD,
    employeeCode: 'DEMO-SD-003',
    role: 'member',
    teamName: 'System Developer',
  },
  {
    name: 'Lara Reyes',
    email: 'demo.lara.reyes@geoplanph.com',
    password: DEFAULT_MEMBER_PASSWORD,
    employeeCode: 'DEMO-SD-004',
    role: 'member',
    teamName: 'System Developer',
  },
  {
    name: 'Marco Villanueva',
    email: 'demo.marco.villanueva@geoplanph.com',
    password: DEFAULT_MEMBER_PASSWORD,
    employeeCode: 'DEMO-BD-001',
    role: 'member',
    teamName: 'Business Development',
  },
  {
    name: 'Sofia Mendoza',
    email: 'demo.sofia.mendoza@geoplanph.com',
    password: DEFAULT_MEMBER_PASSWORD,
    employeeCode: 'DEMO-BD-002',
    role: 'member',
    teamName: 'Business Development',
  },
  {
    name: 'Daniel Cruz',
    email: 'demo.daniel.cruz@geoplanph.com',
    password: DEFAULT_MEMBER_PASSWORD,
    employeeCode: 'DEMO-SALES-001',
    role: 'member',
    teamName: 'Sales',
  },
  {
    name: 'Angela Torres',
    email: 'demo.angela.torres@geoplanph.com',
    password: DEFAULT_MEMBER_PASSWORD,
    employeeCode: 'DEMO-SALES-002',
    role: 'member',
    teamName: 'Sales',
  },
  {
    name: 'Luis Navarro',
    email: 'demo.luis.navarro@geoplanph.com',
    password: DEFAULT_MEMBER_PASSWORD,
    employeeCode: 'DEMO-MKT-001',
    role: 'member',
    teamName: 'Marketing',
  },
  {
    name: 'Bea Ramos',
    email: 'demo.bea.ramos@geoplanph.com',
    password: DEFAULT_MEMBER_PASSWORD,
    employeeCode: 'DEMO-MKT-002',
    role: 'member',
    teamName: 'Marketing',
  },
];

interface TicketSeed {
  ticketNumber: number;
  title: string;
  teamName: TeamName;
  statusName: 'Done' | 'Todo' | 'In Progress' | 'In Review';
  priority: TicketPriority;
}

const TICKET_SEEDS: TicketSeed[] = [
  { ticketNumber: 910001, title: 'Implement attendance report filters', teamName: 'System Developer', statusName: 'Done', priority: TicketPriority.HIGH },
  { ticketNumber: 910002, title: 'Complete timesheet-ticket linking', teamName: 'System Developer', statusName: 'Done', priority: TicketPriority.HIGH },
  { ticketNumber: 910003, title: 'Prepare partner demo proposal', teamName: 'Business Development', statusName: 'Done', priority: TicketPriority.MEDIUM },
  { ticketNumber: 910004, title: 'Close Q4 demo opportunity', teamName: 'Sales', statusName: 'Done', priority: TicketPriority.HIGH },
  { ticketNumber: 910005, title: 'Publish product awareness campaign', teamName: 'Marketing', statusName: 'Done', priority: TicketPriority.MEDIUM },
  { ticketNumber: 910101, title: 'Add dashboard CSV export', teamName: 'System Developer', statusName: 'Todo', priority: TicketPriority.MEDIUM },
  { ticketNumber: 910102, title: 'Review mobile attendance experience', teamName: 'System Developer', statusName: 'In Progress', priority: TicketPriority.HIGH },
  { ticketNumber: 910103, title: 'Improve ticket notification copy', teamName: 'System Developer', statusName: 'In Review', priority: TicketPriority.LOW },
  { ticketNumber: 910104, title: 'Schedule partner discovery workshop', teamName: 'Business Development', statusName: 'Todo', priority: TicketPriority.MEDIUM },
  { ticketNumber: 910105, title: 'Follow up with high-value leads', teamName: 'Sales', statusName: 'In Progress', priority: TicketPriority.URGENT },
];

interface SeededTicket {
  id: string;
  title: string;
  projectId: string;
}

function stableId(key: string): string {
  const hex = createHash('sha256').update(`${DEMO_ID_NAMESPACE}:${key}`).digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

function dateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function manilaToday(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const value = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((part) => part.type === type)?.value ?? '';
  return `${value('year')}-${value('month')}-${value('day')}`;
}

function previousWorkdays(count: number, now = new Date()): string[] {
  const cursor = new Date(`${manilaToday(now)}T00:00:00.000Z`);
  const result: string[] = [];

  while (result.length < count) {
    cursor.setUTCDate(cursor.getUTCDate() - 1);
    const day = cursor.getUTCDay();
    if (day !== 0 && day !== 6) result.push(dateOnly(cursor));
  }

  return result.reverse();
}

function utcDate(date: string): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

function manilaInstant(date: string, time: string): Date {
  return new Date(`${date}T${time}:00+08:00`);
}

function addUtcDays(date: string, days: number): string {
  const value = utcDate(date);
  value.setUTCDate(value.getUTCDate() + days);
  return dateOnly(value);
}

async function seedOrgUser(organizationId: string, seed: UserSeed): Promise<SeededUser> {
  let user = await prisma.user.findUnique({ where: { email: seed.email } });
  if (!user) {
    await auth.api.signUpEmail({
      body: { email: seed.email, password: seed.password, name: seed.name },
    });
    user = await prisma.user.findUniqueOrThrow({ where: { email: seed.email } });
  }

  user = await prisma.user.update({
    where: { id: user.id },
    data: {
      name: seed.name,
      emailVerified: true,
      employeeCode: seed.employeeCode,
    },
  });

  const password = await hashPassword(seed.password);
  const credentials = await prisma.account.updateMany({
    where: { userId: user.id, providerId: 'credential' },
    data: { password },
  });
  if (credentials.count === 0) {
    await prisma.account.create({
      data: {
        id: stableId(`account:${seed.email}`),
        accountId: user.id,
        providerId: 'credential',
        password,
        userId: user.id,
      },
    });
  }

  const member = await prisma.member.upsert({
    where: { organizationId_userId: { organizationId, userId: user.id } },
    update: { role: seed.role },
    create: { organizationId, userId: user.id, role: seed.role },
  });

  return { id: user.id, memberId: member.id, email: user.email };
}

async function seedTeams(organizationId: string): Promise<Map<TeamName, string>> {
  const teams = new Map<TeamName, string>();

  for (const seed of TEAM_SEEDS) {
    let team = await prisma.team.findUnique({
      where: { organizationId_name: { organizationId, name: seed.name } },
    });
    if (!team && 'legacyName' in seed) {
      const legacyTeam = await prisma.team.findUnique({
        where: { organizationId_name: { organizationId, name: seed.legacyName } },
      });
      if (legacyTeam) {
        team = await prisma.team.update({ where: { id: legacyTeam.id }, data: { name: seed.name } });
      }
    }
    if (!team) {
      team = await prisma.team.create({ data: { name: seed.name, organizationId } });
    }
    teams.set(seed.name, team.id);
  }

  return teams;
}

async function seedStatusesAndCategories(organizationId: string): Promise<{
  statusIds: Map<string, string>;
  categoryIds: Map<TeamName, string>;
}> {
  const statusIds = new Map<string, string>();
  for (const status of SYSTEM_STATUSES) {
    const record = await prisma.ticketStatus.upsert({
      where: { organizationId_name: { organizationId, name: status.name } },
      update: { color: status.color, category: status.category, isArchived: false, isSystem: true },
      create: { ...status, organizationId, isSystem: true },
    });
    statusIds.set(record.name, record.id);
  }

  const categoryIds = new Map<TeamName, string>();
  for (const seed of TEAM_SEEDS) {
    const category = await prisma.ticketCategory.upsert({
      where: { organizationId_name: { organizationId, name: seed.name } },
      update: { description: `${seed.name} demo tickets` },
      create: {
        name: seed.name,
        description: `${seed.name} demo tickets`,
        organizationId,
      },
    });
    categoryIds.set(seed.name, category.id);
  }

  return { statusIds, categoryIds };
}

async function seedWorkSchedule(
  organizationId: string,
  teamIds: Map<TeamName, string>,
): Promise<void> {
  await prisma.attendancePolicy.upsert({
    where: { organizationId },
    update: {
      timezone: 'Asia/Manila',
      standardHoursPerDay: 8,
      standardHoursPerWeek: 40,
      graceMinutes: 15,
      lunchMinutes: 60,
      lunchIsPaid: false,
    },
    create: {
      organizationId,
      timezone: 'Asia/Manila',
      standardHoursPerDay: 8,
      standardHoursPerWeek: 40,
      graceMinutes: 15,
      lunchMinutes: 60,
      lunchIsPaid: false,
    },
  });

  const shift = await prisma.shift.upsert({
    where: { organizationId_name: { organizationId, name: 'Demo Day Shift' } },
    update: {
      startTime: '08:00',
      endTime: '17:00',
      breakMinutes: 60,
      graceMinutes: 15,
      crossesMidnight: false,
      isFlexible: false,
      isActive: true,
      isArchived: false,
      color: '#3B82F6',
    },
    create: {
      name: 'Demo Day Shift',
      startTime: '08:00',
      endTime: '17:00',
      breakMinutes: 60,
      graceMinutes: 15,
      crossesMidnight: false,
      isFlexible: false,
      isActive: true,
      isArchived: false,
      color: '#3B82F6',
      organizationId,
    },
  });

  const schedule = await prisma.weeklySchedule.upsert({
    where: { organizationId_name: { organizationId, name: 'Demo Monday-Friday' } },
    update: { isDefault: true, isActive: true, isArchived: false },
    create: {
      name: 'Demo Monday-Friday',
      isDefault: true,
      isActive: true,
      isArchived: false,
      organizationId,
    },
  });

  const days = [
    DayOfWeek.SUNDAY,
    DayOfWeek.MONDAY,
    DayOfWeek.TUESDAY,
    DayOfWeek.WEDNESDAY,
    DayOfWeek.THURSDAY,
    DayOfWeek.FRIDAY,
    DayOfWeek.SATURDAY,
  ];
  for (const dayOfWeek of days) {
    const isWorkingDay = dayOfWeek !== DayOfWeek.SUNDAY && dayOfWeek !== DayOfWeek.SATURDAY;
    await prisma.weeklyScheduleDay.upsert({
      where: {
        weeklyScheduleId_dayOfWeek: { weeklyScheduleId: schedule.id, dayOfWeek },
      },
      update: {
        isWorkingDay,
        expectedSource: isWorkingDay ? AttendanceSource.OFFICE : null,
        trackLateness: isWorkingDay,
        shiftId: isWorkingDay ? shift.id : null,
      },
      create: {
        weeklyScheduleId: schedule.id,
        dayOfWeek,
        isWorkingDay,
        expectedSource: isWorkingDay ? AttendanceSource.OFFICE : null,
        trackLateness: isWorkingDay,
        shiftId: isWorkingDay ? shift.id : null,
      },
    });
  }

  for (const teamId of teamIds.values()) {
    await prisma.teamScheduleAssignment.upsert({
      where: { teamId },
      update: { organizationId, weeklyScheduleId: schedule.id },
      create: { organizationId, teamId, weeklyScheduleId: schedule.id },
    });
  }
}

async function seedProjects(
  organizationId: string,
  teamMembers: Map<TeamName, SeededUser[]>,
): Promise<Map<TeamName, string>> {
  let client = await prisma.client.findFirst({
    where: { organizationId, apptivoId: null, displayName: 'Geoplan Demo Operations' },
  });
  if (!client) {
    client = await prisma.client.create({
      data: {
        id: stableId('client:geoplan-demo-operations'),
        organizationId,
        displayName: 'Geoplan Demo Operations',
        apptivoId: null,
        customerName: null,
      },
    });
  }

  const projectIds = new Map<TeamName, string>();
  for (const seed of TEAM_SEEDS) {
    let project = await prisma.project.findFirst({
      where: {
        organizationId,
        apptivoId: null,
        displayName: seed.projectName,
        clientId: client.id,
      },
    });
    const projectData = {
      displayName: seed.projectName,
      status: 'Open',
      total: 0,
      isArchived: false,
      isClosed: false,
      clientId: client.id,
    };
    if (project) {
      project = await prisma.project.update({ where: { id: project.id }, data: projectData });
    } else {
      project = await prisma.project.create({
        data: {
          id: stableId(`project:${seed.name}`),
          organizationId,
          apptivoId: null,
          workOrderNumber: null,
          customerName: null,
          ...projectData,
        },
      });
    }
    projectIds.set(seed.name, project.id);

    for (const member of teamMembers.get(seed.name) ?? []) {
      await prisma.projectMember.upsert({
        where: { projectId_userId: { projectId: project.id, userId: member.id } },
        update: { organizationId },
        create: { projectId: project.id, userId: member.id, organizationId },
      });
    }
  }

  return projectIds;
}

async function seedTickets(params: {
  organizationId: string;
  admin: SeededUser;
  teamIds: Map<TeamName, string>;
  categoryIds: Map<TeamName, string>;
  statusIds: Map<string, string>;
  projectIds: Map<TeamName, string>;
  teamMembers: Map<TeamName, SeededUser[]>;
  workDates: string[];
}): Promise<Map<TeamName, { completed: SeededTicket[]; open: SeededTicket[] }>> {
  const {
    organizationId,
    admin,
    teamIds,
    categoryIds,
    statusIds,
    projectIds,
    teamMembers,
    workDates,
  } = params;
  const result = new Map<TeamName, { completed: SeededTicket[]; open: SeededTicket[] }>();
  const createdAt = manilaInstant(workDates[0], '07:30');
  const standardResolvedAt = manilaInstant(workDates[5], '17:30');
  const marketingResolvedAt = manilaInstant(workDates[workDates.length - 1], '17:30');
  const dueDate = manilaInstant(addUtcDays(workDates[workDates.length - 1], 7), '17:00');

  for (const team of TEAM_SEEDS) result.set(team.name, { completed: [], open: [] });

  for (const seed of TICKET_SEEDS) {
    const completed = seed.statusName === 'Done';
    const resolvedAt = completed
      ? seed.teamName === 'Marketing' ? marketingResolvedAt : standardResolvedAt
      : null;
    const ticketStatusId = statusIds.get(seed.statusName)!;
    const ticketData = {
      title: seed.title,
      description: `Demo work item for the ${seed.teamName} team.`,
      priority: seed.priority,
      isArchived: false,
      teamId: teamIds.get(seed.teamName)!,
      projectId: projectIds.get(seed.teamName)!,
      categoryId: categoryIds.get(seed.teamName)!,
      ticketStatusId,
      createdById: admin.id,
      firstRespondedAt: seed.statusName === 'Todo' ? null : manilaInstant(workDates[0], '09:00'),
      resolvedAt,
      dueDate: completed ? resolvedAt : dueDate,
      createdAt,
      updatedAt: resolvedAt ?? createdAt,
    };
    const ticketId = stableId(`ticket:${seed.ticketNumber}`);
    const ticketUsingNumber = await prisma.tickets.findUnique({
      where: { organizationId_ticketNumber: { organizationId, ticketNumber: seed.ticketNumber } },
      select: { id: true },
    });
    if (ticketUsingNumber && ticketUsingNumber.id !== ticketId) {
      throw new Error(`Demo ticket number ${seed.ticketNumber} is already used by a non-demo ticket.`);
    }
    const ticket = await prisma.tickets.upsert({
      where: { id: ticketId },
      update: { ticketNumber: seed.ticketNumber, ...ticketData },
      create: {
        id: ticketId,
        organizationId,
        ticketNumber: seed.ticketNumber,
        ...ticketData,
      },
    });

    for (const member of teamMembers.get(seed.teamName) ?? []) {
      await prisma.ticketAssignee.upsert({
        where: { ticketId_memberId: { ticketId: ticket.id, memberId: member.memberId } },
        update: {},
        create: { ticketId: ticket.id, memberId: member.memberId },
      });
    }

    await prisma.ticketActivity.upsert({
      where: { id: stableId(`ticket-activity:${seed.ticketNumber}:created`) },
      update: {
        ticketId: ticket.id,
        actorMemberId: admin.memberId,
        type: TicketActivityType.CREATED,
        meta: { source: 'demo-seed' },
        createdAt,
      },
      create: {
        id: stableId(`ticket-activity:${seed.ticketNumber}:created`),
        ticketId: ticket.id,
        actorMemberId: admin.memberId,
        type: TicketActivityType.CREATED,
        meta: { source: 'demo-seed' },
        createdAt,
      },
    });
    if (resolvedAt) {
      await prisma.ticketActivity.upsert({
        where: { id: stableId(`ticket-activity:${seed.ticketNumber}:completed`) },
        update: {
          ticketId: ticket.id,
          actorMemberId: admin.memberId,
          type: TicketActivityType.STATUS_CHANGED,
          meta: { from: statusIds.get('In Progress')!, to: statusIds.get('Done')! },
          createdAt: resolvedAt,
        },
        create: {
          id: stableId(`ticket-activity:${seed.ticketNumber}:completed`),
          ticketId: ticket.id,
          actorMemberId: admin.memberId,
          type: TicketActivityType.STATUS_CHANGED,
          meta: { from: statusIds.get('In Progress')!, to: statusIds.get('Done')! },
          createdAt: resolvedAt,
        },
      });
    }

    result.get(seed.teamName)![completed ? 'completed' : 'open'].push({
      id: ticket.id,
      title: ticket.title,
      projectId: ticket.projectId!,
    });
  }

  return result;
}

async function seedAttendanceAndTimesheets(params: {
  organizationId: string;
  admin: SeededUser;
  teamMembers: Map<TeamName, SeededUser[]>;
  ticketsByTeam: Map<TeamName, { completed: SeededTicket[]; open: SeededTicket[] }>;
  projectIds: Map<TeamName, string>;
  workDates: string[];
}): Promise<{ attendanceCount: number; leaveCount: number; timesheetCount: number }> {
  const { organizationId, admin, teamMembers, ticketsByTeam, projectIds, workDates } = params;
  const leaveDayByEmail = new Map<string, number>([
    ['geo.maryjairellemangune@gmail.com', 2],
    ['demo.sofia.mendoza@geoplanph.com', 4],
    ['demo.angela.torres@geoplanph.com', 6],
    ['demo.bea.ramos@geoplanph.com', 8],
  ]);
  let attendanceCount = 0;
  let leaveCount = 0;
  let timesheetCount = 0;

  for (const [teamIndex, team] of TEAM_SEEDS.entries()) {
    const members = teamMembers.get(team.name) ?? [];
    const teamTickets = ticketsByTeam.get(team.name)!;

    for (const [memberIndex, member] of members.entries()) {
      for (const [dayIndex, workDate] of workDates.entries()) {
        const isLeave = leaveDayByEmail.get(member.email) === dayIndex;
        const attendanceDate = manilaInstant(workDate, '00:00');
        const eventPrefix = `demo-seed:${member.id}:${workDate}:`;
        let timesheetLocation = 'OFC - DW';
        await prisma.attendanceEvent.deleteMany({
          where: { employeeId: member.id, externalId: { startsWith: eventPrefix } },
        });

        if (isLeave) {
          // LEAVE is a timesheet work type; leave days intentionally have no clock punches.
          await prisma.attendance.deleteMany({
            where: { employeeId: member.id, date: attendanceDate },
          });
          leaveCount += 1;
        } else {
          const isLate = (teamIndex + memberIndex + dayIndex) % 7 === 0;
          const isWfh = (teamIndex + memberIndex + dayIndex) % 5 === 2;
          timesheetLocation = isWfh ? 'WFH - Home' : 'OFC - DW';
          const source = isWfh ? AttendanceSource.WFH : AttendanceSource.OFFICE;
          const firstIn = manilaInstant(workDate, isLate ? '08:30' : '08:00');
          const lastOut = new Date(firstIn.getTime() + 8 * 60 * 60 * 1000);
          const inEventType = isWfh ? AttendanceEventType.WFH_IN : AttendanceEventType.OFFICE_IN;
          const outEventType = isWfh ? AttendanceEventType.WFH_OUT : AttendanceEventType.OFFICE_OUT;

          await prisma.attendance.upsert({
            where: { employeeId_date: { employeeId: member.id, date: attendanceDate } },
            update: { firstIn, lastOut, billableHours: 8 },
            create: {
              employeeId: member.id,
              date: attendanceDate,
              firstIn,
              lastOut,
              billableHours: 8,
            },
          });
          await prisma.attendanceEvent.createMany({
            data: [
              {
                employeeId: member.id,
                source,
                eventType: inEventType,
                origin: AttendanceOrigin.MANUAL,
                externalId: `${eventPrefix}in`,
                timestamp: firstIn,
              },
              {
                employeeId: member.id,
                source,
                eventType: outEventType,
                origin: AttendanceOrigin.MANUAL,
                externalId: `${eventPrefix}out`,
                timestamp: lastOut,
              },
            ],
          });
          attendanceCount += 1;
        }

        const useCompletedTicket = dayIndex < 6 || teamTickets.open.length === 0;
        const candidateTickets = useCompletedTicket ? teamTickets.completed : teamTickets.open;
        const ticket = candidateTickets[(memberIndex + dayIndex) % candidateTickets.length];
        const submittedAt = manilaInstant(workDate, '17:00');
        const approvedAt = manilaInstant(workDate, '18:00');
        const entryId = stableId(`timesheet:${member.email}:${workDate}`);
        const entryData = isLeave
          ? {
              organizationId,
              userId: member.id,
              projectId: null,
              ticketId: null,
              description: 'Approved leave',
              workDate: utcDate(workDate),
              hours: 8,
              location: 'LEAVE',
              workType: TimesheetWorkType.LEAVE,
              task: 'Approved leave',
              projectDescription: null,
              isOvertime: false,
              isNightDifferential: false,
              status: TimesheetEntryStatus.APPROVED,
              submittedAt,
              approvedAt,
              approvedByMemberId: admin.memberId,
              rejectedAt: null,
              rejectedByMemberId: null,
              rejectionReason: null,
              createdAt: manilaInstant(workDate, '08:00'),
              updatedAt: approvedAt,
            }
          : {
              organizationId,
              userId: member.id,
              projectId: projectIds.get(team.name)!,
              ticketId: ticket.id,
              description: ticket.title,
              workDate: utcDate(workDate),
              hours: 8,
              location: timesheetLocation,
              workType: TimesheetWorkType.REGULAR,
              task: ticket.title,
              projectDescription: team.projectName,
              isOvertime: false,
              isNightDifferential: false,
              status: TimesheetEntryStatus.APPROVED,
              submittedAt,
              approvedAt,
              approvedByMemberId: admin.memberId,
              rejectedAt: null,
              rejectedByMemberId: null,
              rejectionReason: null,
              createdAt: manilaInstant(workDate, '08:00'),
              updatedAt: approvedAt,
            };

        await prisma.timesheetEntry.upsert({
          where: { id: entryId },
          update: entryData,
          create: { id: entryId, ...entryData },
        });
        timesheetCount += 1;
      }
    }
  }

  return { attendanceCount, leaveCount, timesheetCount };
}

async function main(): Promise<void> {
  assertSafeSeedTarget(process.env);
  console.info('Seeding production demo data...');

  const organization = await prisma.organization.upsert({
    where: { slug: ORG_SLUG },
    update: { name: ORG_NAME },
    create: { name: ORG_NAME, slug: ORG_SLUG },
  });
  const teamIds = await seedTeams(organization.id);
  const { statusIds, categoryIds } = await seedStatusesAndCategories(organization.id);

  const seededUsers = new Map<string, SeededUser>();
  for (const seed of USER_SEEDS) {
    seededUsers.set(seed.email, await seedOrgUser(organization.id, seed));
  }
  const admin = seededUsers.get('admin@geoplanph.com')!;
  const teamMembers = new Map<TeamName, SeededUser[]>();
  for (const team of TEAM_SEEDS) teamMembers.set(team.name, []);
  for (const seed of USER_SEEDS) {
    if (!seed.teamName) continue;
    const member = seededUsers.get(seed.email)!;
    await prisma.teamMember.upsert({
      where: { teamId_userId: { teamId: teamIds.get(seed.teamName)!, userId: member.id } },
      update: {},
      create: { teamId: teamIds.get(seed.teamName)!, userId: member.id },
    });
    teamMembers.get(seed.teamName)!.push(member);
  }

  await seedWorkSchedule(organization.id, teamIds);
  const projectIds = await seedProjects(organization.id, teamMembers);
  const workDates = previousWorkdays(WORKDAY_COUNT);
  const ticketsByTeam = await seedTickets({
    organizationId: organization.id,
    admin,
    teamIds,
    categoryIds,
    statusIds,
    projectIds,
    teamMembers,
    workDates,
  });
  const history = await seedAttendanceAndTimesheets({
    organizationId: organization.id,
    admin,
    teamMembers,
    ticketsByTeam,
    projectIds,
    workDates,
  });

  console.info(
    `Seed complete: ${USER_SEEDS.length} users, ${TEAM_SEEDS.length} teams, ` +
    `${TICKET_SEEDS.filter((ticket) => ticket.statusName === 'Done').length} completed tickets, ` +
    `${TICKET_SEEDS.filter((ticket) => ticket.statusName !== 'Done').length} open tickets, ` +
    `${history.attendanceCount} attendance records, ${history.leaveCount} leave days, ` +
    `${history.timesheetCount} timesheet entries (${workDates[0]} to ${workDates.at(-1)}).`,
  );
}

main()
  .catch((error: unknown) => {
    console.error('Seed failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
