import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../../../../core/database/prisma.service';

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
