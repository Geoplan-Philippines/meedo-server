import { Injectable, NotFoundException } from '@nestjs/common';
import { AttendancePolicy, AttendanceSource, DayOfWeek, Prisma, Shift } from '@prisma/client';

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
export type AssignmentSource = 'employee' | 'team' | 'organization-default' | 'none';

/** Trimmed holiday shape used for month/day matching without loading every column. */
type HolidayMatch = { date: Date; isRecurring: boolean };

/**
 * The effective schedule for one employee on one date: which weekly schedule
 * applied (and how it was resolved), plus the derived shift, work mode, expected
 * hours, rest-day/holiday flags, and the org policy. This is the read-only
 * contract the attendance engine consumes to grade a day.
 */
export interface EffectiveSchedule {
  userId: string;
  date: string;
  dayOfWeek: DayOfWeek;
  source: AssignmentSource;
  schedule: { id: string; name: string; isDefault: boolean } | null;
  isWorkingDay: boolean | null;
  isRestDay: boolean | null;
  expectedSource: AttendanceSource | null;
  expectedHours: number;
  isFlexible: boolean;
  /** When false, lateness is not recorded for this day (per the weekly schedule). */
  trackLateness: boolean;
  shift: Shift | null;
  isHoliday: boolean;
  policy: AttendancePolicy;
}

/**
 * Read-only resolver: works out which weekly schedule (and therefore shift, work
 * mode, and hours) applies to an employee on a given date, following the
 * employee -> team -> org-default precedence. It never writes. It powers the
 * "effective" preview endpoint and is the seam the attendance engine reads from
 * to grade each day (present/late/absent/rest/holiday, expected vs actual hours).
 */
@Injectable()
export class ScheduleResolverService {
  constructor(
    private prisma: PrismaService,
    private policyService: AttendancePolicyService,
  ) {}

  /** Effective schedule for a single employee on a single date. */
  async resolveEffective(
    organizationId: string,
    userId: string,
    dateInput?: string,
  ): Promise<EffectiveSchedule> {
    await this.assertMember(organizationId, userId);

    const date = parseDateOnly(dateInput ?? new Date().toISOString());
    const [{ schedule, source }, policy, holidays] = await Promise.all([
      this.resolveSchedule(organizationId, userId),
      this.policyService.getPolicy(organizationId),
      this.loadHolidays(organizationId),
    ]);

    return this.buildEffective(userId, date, schedule, source, policy, holidays);
  }

  /**
   * Effective schedule for many employees on one date. Policy and holidays are
   * fetched once and shared, so grading a roster page costs one policy read and
   * one holiday read plus a schedule lookup per employee.
   */
  async resolveEffectiveForUsers(
    organizationId: string,
    userIds: string[],
    dateInput?: string,
  ): Promise<Map<string, EffectiveSchedule>> {
    const result = new Map<string, EffectiveSchedule>();
    if (userIds.length === 0) return result;

    const date = parseDateOnly(dateInput ?? new Date().toISOString());
    const [policy, holidays] = await Promise.all([
      this.policyService.getPolicy(organizationId),
      this.loadHolidays(organizationId),
    ]);

    await Promise.all(
      [...new Set(userIds)].map(async (userId) => {
        const { schedule, source } = await this.resolveSchedule(organizationId, userId);
        result.set(userId, this.buildEffective(userId, date, schedule, source, policy, holidays));
      }),
    );

    return result;
  }

  /**
   * Effective schedule for one employee across many dates. The employee's
   * schedule and the org policy are constant across the range, so they are
   * resolved once; only the weekday entry and holiday match vary per date.
   */
  async resolveEffectiveForDates(
    organizationId: string,
    userId: string,
    dateInputs: string[],
  ): Promise<Map<string, EffectiveSchedule>> {
    const result = new Map<string, EffectiveSchedule>();
    if (dateInputs.length === 0) return result;

    const [{ schedule, source }, policy, holidays] = await Promise.all([
      this.resolveSchedule(organizationId, userId),
      this.policyService.getPolicy(organizationId),
      this.loadHolidays(organizationId),
    ]);

    for (const input of dateInputs) {
      const date = parseDateOnly(input);
      result.set(
        toDateString(date),
        this.buildEffective(userId, date, schedule, source, policy, holidays),
      );
    }

    return result;
  }

  /** Assemble the effective view from an already-resolved schedule, policy, and holiday set. */
  private buildEffective(
    userId: string,
    date: Date,
    schedule: ScheduleWithDays | null,
    source: AssignmentSource,
    policy: AttendancePolicy,
    holidays: HolidayMatch[],
  ): EffectiveSchedule {
    const dayOfWeek = DAY_OF_WEEK_BY_INDEX[date.getUTCDay()];
    const day = schedule?.days.find((entry) => entry.dayOfWeek === dayOfWeek) ?? null;
    const shift = day?.shift ?? null;

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
      trackLateness: day?.trackLateness ?? true,
      shift,
      isHoliday: this.matchesHoliday(holidays, date),
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

  /** All holidays for the org, trimmed to what month/day matching needs. */
  private loadHolidays(organizationId: string): Promise<HolidayMatch[]> {
    return this.prisma.holiday.findMany({
      where: { organizationId },
      select: { date: true, isRecurring: true },
    });
  }

  /** A date is a holiday if a one-off matches the full date or a recurring one matches the month/day. */
  private matchesHoliday(holidays: HolidayMatch[], date: Date): boolean {
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
