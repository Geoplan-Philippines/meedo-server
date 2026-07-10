import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../../../../core/database/prisma.service';
import { AttendancePolicyService } from '../../policy/attendance-policy.service';
import {
  DAY_OF_WEEK_BY_INDEX,
  parseDateOnly,
  shiftWorkedHours,
  toDateString,
} from '../../shared/attendance-settings.util';

const SCHEDULE_WITH_DAYS = {
  days: { include: { shift: true } },
} satisfies Prisma.WeeklyScheduleInclude;

type ScheduleWithDays = Prisma.WeeklyScheduleGetPayload<{ include: typeof SCHEDULE_WITH_DAYS }>;

/** Which layer of the org-default -> team -> employee hierarchy applied. */
type AssignmentSource = 'employee' | 'team' | 'organization-default' | 'none';

/**
 * Read-only resolver: works out which weekly schedule (and therefore shift, work
 * mode, and hours) applies to an employee on a given date, following the
 * employee -> team -> org-default precedence. It never writes and is not yet
 * consumed by the attendance/timesheet engine — it powers the "effective"
 * preview endpoint and is the seam a later phase will read from.
 */
@Injectable()
export class ScheduleResolverService {
  constructor(
    private prisma: PrismaService,
    private policyService: AttendancePolicyService,
  ) {}

  async resolveEffective(organizationId: string, userId: string, dateInput?: string) {
    await this.assertMember(organizationId, userId);

    const date = parseDateOnly(dateInput ?? new Date().toISOString());
    const dayOfWeek = DAY_OF_WEEK_BY_INDEX[date.getUTCDay()];

    const { schedule, source } = await this.resolveSchedule(organizationId, userId);
    const day = schedule?.days.find((entry) => entry.dayOfWeek === dayOfWeek) ?? null;
    const shift = day?.shift ?? null;

    const [policy, isHoliday] = await Promise.all([
      this.policyService.getPolicy(organizationId),
      this.isHoliday(organizationId, date),
    ]);

    return {
      userId,
      date: toDateString(date),
      dayOfWeek,
      source,
      schedule: schedule
        ? { id: schedule.id, name: schedule.name, isDefault: schedule.isDefault }
        : null,
      isWorkingDay: day ? day.isWorkingDay : null,
      isRestDay: day ? !day.isWorkingDay : null,
      expectedSource: day?.expectedSource ?? null,
      expectedHours: shift
        ? shiftWorkedHours(shift.startTime, shift.endTime, shift.breakMinutes, shift.crossesMidnight)
        : 0,
      isFlexible: shift?.isFlexible ?? false,
      shift,
      isHoliday,
      policy,
    };
  }

  /** Highest-precedence schedule for the employee: their own, then their team's, then the org default. */
  private async resolveSchedule(
    organizationId: string,
    userId: string,
  ): Promise<{ schedule: ScheduleWithDays | null; source: AssignmentSource }> {
    const employee = await this.prisma.employeeScheduleAssignment.findUnique({
      where: { organizationId_userId: { organizationId, userId } },
      include: { weeklySchedule: { include: SCHEDULE_WITH_DAYS } },
    });
    if (employee) {
      return { schedule: employee.weeklySchedule, source: 'employee' };
    }

    const teamMember = await this.prisma.teamMember.findFirst({
      where: { userId, team: { organizationId } },
      orderBy: { createdAt: 'asc' },
      select: { teamId: true },
    });
    if (teamMember) {
      const teamAssignment = await this.prisma.teamScheduleAssignment.findUnique({
        where: { teamId: teamMember.teamId },
        include: { weeklySchedule: { include: SCHEDULE_WITH_DAYS } },
      });
      if (teamAssignment) {
        return { schedule: teamAssignment.weeklySchedule, source: 'team' };
      }
    }

    const orgDefault = await this.prisma.weeklySchedule.findFirst({
      where: { organizationId, isDefault: true },
      include: SCHEDULE_WITH_DAYS,
    });
    if (orgDefault) {
      return { schedule: orgDefault, source: 'organization-default' };
    }

    return { schedule: null, source: 'none' };
  }

  /** A date is a holiday if a one-off matches the full date or a recurring one matches the month/day. */
  private async isHoliday(organizationId: string, date: Date): Promise<boolean> {
    const holidays = await this.prisma.holiday.findMany({
      where: { organizationId },
      select: { date: true, isRecurring: true },
    });

    const year = date.getUTCFullYear();
    const month = date.getUTCMonth();
    const day = date.getUTCDate();

    return holidays.some((holiday) => {
      const sameMonthDay =
        holiday.date.getUTCMonth() === month && holiday.date.getUTCDate() === day;
      if (holiday.isRecurring) {
        return sameMonthDay;
      }
      return sameMonthDay && holiday.date.getUTCFullYear() === year;
    });
  }

  private async assertMember(organizationId: string, userId: string): Promise<void> {
    const member = await this.prisma.member.findUnique({
      where: { organizationId_userId: { organizationId, userId } },
      select: { id: true },
    });
    if (!member) {
      throw new NotFoundException('Employee not found in this organization.');
    }
  }
}
