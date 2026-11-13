import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../../../core/database/prisma.service';
import { ListQueryDTO } from '../../../../common/dto/list-query.dto';
import { containsInsensitive, pageArgs, termSearchWhere, toPage } from '../../../../common/utils/pagination.util';

const SCHEDULE_SELECT = { id: true, name: true, isDefault: true };

@Injectable()
export class ScheduleAssignmentsService {
  constructor(private prisma: PrismaService) {}

  /** Every explicit team and employee schedule assignment in the organization. */
  async listAssignments(organizationId: string) {
    const [teams, employees] = await Promise.all([
      this.prisma.teamScheduleAssignment.findMany({
        where: { organizationId },
        include: {
          team: { select: { id: true, name: true } },
          weeklySchedule: { select: SCHEDULE_SELECT },
        },
        orderBy: { team: { name: 'asc' } },
      }),
      this.prisma.employeeScheduleAssignment.findMany({
        where: { organizationId },
        include: {
          user: { select: { id: true, name: true, email: true } },
          weeklySchedule: { select: SCHEDULE_SELECT },
        },
        orderBy: { user: { name: 'asc' } },
      }),
    ]);

    return { teams, employees };
  }

  /**
   * One page of the organization's teams, A–Z, each with its explicit schedule
   * (null when it falls back to the org default). `meta.assignedCount` counts
   * matching teams that have a schedule of their own.
   */
  async listTeamAssignments(organizationId: string, query: ListQueryDTO) {
    const where: Prisma.TeamWhereInput = {
      organizationId,
      ...(query.search ? { name: containsInsensitive(query.search) } : {}),
    };
    const [teams, total, assignedCount] = await Promise.all([
      this.prisma.team.findMany({
        where,
        select: { id: true, name: true, scheduleAssignment: { select: { weeklyScheduleId: true, weeklySchedule: { select: SCHEDULE_SELECT } } } },
        orderBy: [{ name: query.sortOrder ?? 'asc' }, { id: 'asc' }],
        ...pageArgs(query),
      }),
      this.prisma.team.count({ where }),
      this.prisma.team.count({ where: { ...where, scheduleAssignment: { isNot: null } } }),
    ]);
    const page = toPage(
      teams.map(({ scheduleAssignment, ...team }) => ({
        ...team,
        weeklyScheduleId: scheduleAssignment?.weeklyScheduleId ?? null,
        weeklySchedule: scheduleAssignment?.weeklySchedule ?? null,
      })),
      total,
      query,
    );
    return { ...page, meta: { ...page.meta, assignedCount } };
  }

  /**
   * One page of organization members by name, each with their personal schedule
   * override (null when their team or the org default applies).
   * `meta.assignedCount` counts matching members with an override.
   */
  async listEmployeeAssignments(organizationId: string, query: ListQueryDTO) {
    const where: Prisma.MemberWhereInput = {
      organizationId,
      ...termSearchWhere<Prisma.MemberWhereInput>(query.search, (term) => [
        { user: { name: containsInsensitive(term) } },
        { user: { email: containsInsensitive(term) } },
      ]),
    };
    const assigned: Prisma.MemberWhereInput = {
      ...where,
      user: { scheduleAssignments: { some: { organizationId } } },
    };
    const [members, total, assignedCount] = await Promise.all([
      this.prisma.member.findMany({
        where,
        select: {
          userId: true,
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              scheduleAssignments: { where: { organizationId }, select: { weeklyScheduleId: true, weeklySchedule: { select: SCHEDULE_SELECT } } },
            },
          },
        },
        orderBy: [{ user: { name: { sort: query.sortOrder ?? 'asc', nulls: 'last' } } }, { id: 'asc' }],
        ...pageArgs(query),
      }),
      this.prisma.member.count({ where }),
      this.prisma.member.count({ where: assigned }),
    ]);
    const page = toPage(
      members.map(({ userId, user }) => ({
        userId,
        name: user.name || user.email,
        email: user.email,
        weeklyScheduleId: user.scheduleAssignments[0]?.weeklyScheduleId ?? null,
        weeklySchedule: user.scheduleAssignments[0]?.weeklySchedule ?? null,
      })),
      total,
      query,
    );
    return { ...page, meta: { ...page.meta, assignedCount } };
  }

  async assignTeam(organizationId: string, teamId: string, weeklyScheduleId: string) {
    await this.assertTeamInOrg(organizationId, teamId);
    await this.assertScheduleInOrg(organizationId, weeklyScheduleId);

    return this.prisma.teamScheduleAssignment.upsert({
      where: { teamId },
      create: { organizationId, teamId, weeklyScheduleId },
      update: { weeklyScheduleId },
      include: {
        team: { select: { id: true, name: true } },
        weeklySchedule: { select: SCHEDULE_SELECT },
      },
    });
  }

  async clearTeam(organizationId: string, teamId: string): Promise<{ teamId: string }> {
    await this.prisma.teamScheduleAssignment.deleteMany({ where: { organizationId, teamId } });
    return { teamId };
  }

  async assignEmployee(organizationId: string, userId: string, weeklyScheduleId: string) {
    await this.assertMemberInOrg(organizationId, userId);
    await this.assertScheduleInOrg(organizationId, weeklyScheduleId);

    return this.prisma.employeeScheduleAssignment.upsert({
      where: { organizationId_userId: { organizationId, userId } },
      create: { organizationId, userId, weeklyScheduleId },
      update: { weeklyScheduleId },
      include: {
        user: { select: { id: true, name: true, email: true } },
        weeklySchedule: { select: SCHEDULE_SELECT },
      },
    });
  }

  async clearEmployee(organizationId: string, userId: string): Promise<{ userId: string }> {
    await this.prisma.employeeScheduleAssignment.deleteMany({ where: { organizationId, userId } });
    return { userId };
  }

  private async assertTeamInOrg(organizationId: string, teamId: string): Promise<void> {
    const team = await this.prisma.team.findFirst({
      where: { id: teamId, organizationId },
      select: { id: true },
    });
    if (!team) {
      throw new NotFoundException('Team not found in this organization.');
    }
  }

  private async assertMemberInOrg(organizationId: string, userId: string): Promise<void> {
    const member = await this.prisma.member.findUnique({
      where: { organizationId_userId: { organizationId, userId } },
      select: { id: true },
    });
    if (!member) {
      throw new NotFoundException('Employee not found in this organization.');
    }
  }

  private async assertScheduleInOrg(organizationId: string, weeklyScheduleId: string): Promise<void> {
    const schedule = await this.prisma.weeklySchedule.findFirst({
      where: { id: weeklyScheduleId, organizationId },
      select: { id: true },
    });
    if (!schedule) {
      throw new BadRequestException('Weekly schedule not found in this organization.');
    }
  }
}
