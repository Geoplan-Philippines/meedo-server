import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../../../../core/database/prisma.service';
import { ScheduleAssignmentsService } from './schedule-assignments.service';

const prisma = {
  team: { findMany: jest.fn(), count: jest.fn() },
  member: { findMany: jest.fn(), count: jest.fn() },
};

const schedule = { id: 'ws-1', name: 'Day shift', isDefault: false };

describe('ScheduleAssignmentsService paged lists', () => {
  let service: ScheduleAssignmentsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ScheduleAssignmentsService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get(ScheduleAssignmentsService);
    jest.resetAllMocks();
  });

  it('pages teams with their explicit schedule and counts assigned teams', async () => {
    prisma.team.findMany.mockResolvedValue([
      { id: 't-1', name: 'Ops', scheduleAssignment: { weeklyScheduleId: 'ws-1', weeklySchedule: schedule } },
      { id: 't-2', name: 'Sales', scheduleAssignment: null },
    ]);
    prisma.team.count.mockResolvedValueOnce(12).mockResolvedValueOnce(5);

    const result = await service.listTeamAssignments('org-1', { page: 1, limit: 10, search: 'o' });

    const where = { organizationId: 'org-1', name: { contains: 'o', mode: 'insensitive' } };
    expect(prisma.team.findMany).toHaveBeenCalledWith(expect.objectContaining({ where, skip: 0, take: 10 }));
    expect(prisma.team.count).toHaveBeenNthCalledWith(2, { where: { ...where, scheduleAssignment: { isNot: null } } });
    expect(result).toEqual({
      data: [
        { id: 't-1', name: 'Ops', weeklyScheduleId: 'ws-1', weeklySchedule: schedule },
        { id: 't-2', name: 'Sales', weeklyScheduleId: null, weeklySchedule: null },
      ],
      meta: { total: 12, page: 1, limit: 10, lastPage: 2, assignedCount: 5 },
    });
  });

  it('pages members by name with their personal override', async () => {
    prisma.member.findMany.mockResolvedValue([
      { userId: 'u-1', user: { id: 'u-1', name: null, email: 'ada@example.com', scheduleAssignments: [{ weeklyScheduleId: 'ws-1', weeklySchedule: schedule }] } },
    ]);
    prisma.member.count.mockResolvedValueOnce(1).mockResolvedValueOnce(1);

    const result = await service.listEmployeeAssignments('org-1', { page: 2, limit: 5, search: 'ada' });

    expect(prisma.member.findMany).toHaveBeenCalledWith(expect.objectContaining({
      orderBy: [{ user: { name: { sort: 'asc', nulls: 'last' } } }, { id: 'asc' }],
      skip: 5,
      take: 5,
    }));
    expect(prisma.member.count).toHaveBeenNthCalledWith(2, {
      where: expect.objectContaining({ organizationId: 'org-1', user: { scheduleAssignments: { some: { organizationId: 'org-1' } } } }),
    });
    expect(result.data).toEqual([{ userId: 'u-1', name: 'ada@example.com', email: 'ada@example.com', weeklyScheduleId: 'ws-1', weeklySchedule: schedule }]);
    expect(result.meta).toMatchObject({ total: 1, page: 2, limit: 5, assignedCount: 1 });
  });
});
