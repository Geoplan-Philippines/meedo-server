import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../../core/database/prisma.service';
import { ScheduleResolverService } from '../../settings/attendance/assignments/resolver/schedule-resolver.service';
import { ATTENDANCE_TIMEZONE_OFFSET_MINUTES, OUT_EVENT_TYPES } from '../constants/attendance.constants';
import {
  getAttendanceDayKey,
  getAttendanceDayRange,
  parseAttendanceDate,
  toCompanyOffsetIso,
} from '../utils/attendance-day.util';
import { AttendanceDayStatus, AttendanceStatus, deriveDayStatus } from '../utils/attendance-status.util';
import {
  buildPaginationMeta,
  PaginatedResponse,
} from 'src/common/responses/paginated-api.response';
import { BoardRosterEntry, BoardSummary, TardinessEntry, TardinessResult } from './attendance-board.constants';
import { BoardStatusFilter, GetBoardRosterQueryDTO } from './dto/get-board-roster-query.dto';
import { GetTardinessQueryDTO, TardinessPeriod } from './dto/get-tardiness-query.dto';

const OFFSET_MS = ATTENDANCE_TIMEZONE_OFFSET_MINUTES * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Order actionable statuses to the top of the board. */
const STATUS_PRIORITY: Record<BoardStatusFilter, number> = {
  late: 0,
  absent: 1,
  upcoming: 2,
  present: 3,
  off: 4,
};

const EMPLOYEE_SELECT = {
  id: true,
  name: true,
  email: true,
  employeeCode: true,
  teamMembers: {
    select: { team: { select: { name: true } } },
    take: 1,
  },
} satisfies Prisma.UserSelect;

type BoardEmployee = Prisma.UserGetPayload<{ select: typeof EMPLOYEE_SELECT }>;

interface GradedRow {
  employee: BoardEmployee;
  status: AttendanceDayStatus;
  firstIn: Date | null;
  available: boolean;
}

/**
 * The admin attendance board: a member-centric view (every scheduled employee,
 * so absences actually surface) that grades each employee's day against the
 * attendance settings, plus a lateness scoreboard over a day/week/month window.
 */
@Injectable()
export class AttendanceBoardService {
  constructor(
    private prisma: PrismaService,
    private resolver: ScheduleResolverService,
  ) {}

  /** Headline counts for the viewed day. */
  async getSummary(organizationId: string, date?: string): Promise<BoardSummary> {
    const { rows, dayKey, isToday, asOf } = await this.buildGradedRows(organizationId, date);

    const counts: Record<BoardStatusFilter, number> = {
      present: 0,
      late: 0,
      absent: 0,
      upcoming: 0,
      off: 0,
    };
    let availableNow = 0;
    for (const row of rows) {
      counts[toFilter(row.status.status)] += 1;
      if (row.available) availableNow += 1;
    }

    return {
      date: toCompanyOffsetIso(dayKey).slice(0, 10),
      asOf: (asOf ?? getAttendanceDayRange(dayKey).end).toISOString(),
      isToday,
      scheduled: counts.present + counts.late + counts.absent + counts.upcoming,
      // A late employee still showed up, so Present counts them; Late is the subset.
      present: counts.present + counts.late,
      late: counts.late,
      absent: counts.absent,
      upcoming: counts.upcoming,
      off: counts.off,
      total: rows.length,
      availableNow,
    };
  }

  /** Paginated, searchable, status-filterable roster for the viewed day. */
  async getRoster(
    organizationId: string,
    query: GetBoardRosterQueryDTO,
  ): Promise<PaginatedResponse<BoardRosterEntry>> {
    const { page, limit, date, search, status } = query;
    const { rows } = await this.buildGradedRows(organizationId, date, search);

    // "Present" includes late (they still showed up); every other filter is exact.
    const filtered = status
      ? rows.filter((row) => {
          const bucket = toFilter(row.status.status);
          return status === 'present' ? bucket === 'present' || bucket === 'late' : bucket === status;
        })
      : rows;
    filtered.sort(
      (a, b) =>
        STATUS_PRIORITY[toFilter(a.status.status)] - STATUS_PRIORITY[toFilter(b.status.status)] ||
        (a.employee.name ?? a.employee.email).localeCompare(b.employee.name ?? b.employee.email),
    );

    const total = filtered.length;
    const start = (page - 1) * limit;
    const data: BoardRosterEntry[] = filtered.slice(start, start + limit).map((row) => ({
      employeeId: row.employee.id,
      name: row.employee.name,
      email: row.employee.email,
      employeeCode: row.employee.employeeCode,
      department: row.employee.teamMembers[0]?.team.name ?? null,
      status: row.status,
      firstIn: row.firstIn,
      available: row.available,
    }));

    return { data, meta: buildPaginationMeta(total, page, limit) };
  }

  /** Lateness scoreboard over the day/week/month window around the anchor date. */
  async getTardiness(
    organizationId: string,
    query: GetTardinessQueryDTO,
  ): Promise<TardinessResult> {
    const { page, limit, date, search } = query;
    const period = query.period ?? 'weekly';
    const { from, to } = this.periodRange(date, period);

    const where: Prisma.AttendanceWhereInput = {
      date: { gte: from, lte: to },
      employee: {
        members: { some: { organizationId } },
        ...(search ? { OR: searchOr(search) } : {}),
      },
    };

    const records = await this.prisma.attendance.findMany({
      where,
      select: {
        employeeId: true,
        date: true,
        firstIn: true,
        lastOut: true,
        billableHours: true,
        employee: { select: EMPLOYEE_SELECT },
      },
      orderBy: { date: 'asc' },
    });

    // Group by employee so each employee's schedule is resolved once for the window.
    const byEmployee = new Map<string, { employee: BoardEmployee; records: typeof records }>();
    for (const record of records) {
      const bucket = byEmployee.get(record.employeeId);
      if (bucket) {
        bucket.records.push(record);
      } else {
        byEmployee.set(record.employeeId, { employee: record.employee, records: [record] });
      }
    }

    const entries: Omit<TardinessEntry, 'rank'>[] = [];
    for (const [employeeId, { employee, records: empRecords }] of byEmployee) {
      const dateKeys = empRecords.map((record) => toCompanyOffsetIso(record.date).slice(0, 10));
      const effectiveByDate = await this.resolver.resolveEffectiveForDates(
        organizationId,
        employeeId,
        dateKeys,
      );

      let lateDays = 0;
      let totalLateMinutes = 0;
      let workedDays = 0;
      for (const record of empRecords) {
        if (record.firstIn) workedDays += 1;
        const effective = effectiveByDate.get(toCompanyOffsetIso(record.date).slice(0, 10));
        if (!effective) continue;
        const graded = deriveDayStatus(effective, {
          firstIn: record.firstIn,
          lastOut: record.lastOut,
          billableHours: record.billableHours,
        });
        if (graded.status === 'late') {
          lateDays += 1;
          totalLateMinutes += graded.lateMinutes;
        }
      }

      entries.push({
        employeeId,
        name: employee.name,
        email: employee.email,
        employeeCode: employee.employeeCode,
        department: employee.teamMembers[0]?.team.name ?? null,
        lateDays,
        totalLateMinutes,
        avgLateMinutes: lateDays > 0 ? Math.round(totalLateMinutes / lateDays) : 0,
        workedDays,
      });
    }

    // Worst offenders first; on-time employees still appear (ranked last) so a
    // search for anyone resolves.
    entries.sort(
      (a, b) =>
        b.totalLateMinutes - a.totalLateMinutes ||
        b.lateDays - a.lateDays ||
        (a.name ?? a.email).localeCompare(b.name ?? b.email),
    );

    const total = entries.length;
    const start = (page - 1) * limit;
    const data: TardinessEntry[] = entries
      .slice(start, start + limit)
      .map((entry, index) => ({ ...entry, rank: start + index + 1 }));

    return {
      data,
      meta: {
        ...buildPaginationMeta(total, page, limit),
        period,
        from: toCompanyOffsetIso(from).slice(0, 10),
        to: toCompanyOffsetIso(to).slice(0, 10),
      },
    };
  }

  /**
   * Grade every organization member against the viewed day. On today the grade
   * is live (`asOf` = now), so a not-yet-due employee reads `upcoming` rather
   * than `absent`; on a past day it's final.
   */
  private async buildGradedRows(
    organizationId: string,
    date?: string,
    search?: string,
  ): Promise<{ rows: GradedRow[]; dayKey: Date; isToday: boolean; asOf: Date | null }> {
    const now = new Date();
    const dayKey = date ? parseAttendanceDate(date) : getAttendanceDayKey(now);
    const isToday = dayKey.getTime() === getAttendanceDayKey(now).getTime();
    const asOf = isToday ? now : null;
    const dateOnly = toCompanyOffsetIso(dayKey).slice(0, 10);

    const members = await this.prisma.member.findMany({
      where: {
        organizationId,
        ...(search ? { user: { OR: searchOr(search) } } : {}),
      },
      select: { user: { select: EMPLOYEE_SELECT } },
    });
    const employees = members
      .map((member) => member.user)
      .filter((user): user is BoardEmployee => user !== null);
    const employeeIds = employees.map((employee) => employee.id);

    const [effectiveByUser, records, openNow] = await Promise.all([
      this.resolver.resolveEffectiveForUsers(organizationId, employeeIds, dateOnly),
      this.prisma.attendance.findMany({
        where: { employeeId: { in: employeeIds }, date: dayKey },
        select: { employeeId: true, firstIn: true, lastOut: true, billableHours: true },
      }),
      this.openSessionEmployeeIds(employeeIds),
    ]);

    const recordByEmployee = new Map(records.map((record) => [record.employeeId, record]));

    const rows: GradedRow[] = employees.map((employee) => {
      const effective = effectiveByUser.get(employee.id)!;
      const record = recordByEmployee.get(employee.id) ?? null;
      return {
        employee,
        status: deriveDayStatus(
          effective,
          {
            firstIn: record?.firstIn ?? null,
            lastOut: record?.lastOut ?? null,
            billableHours: record?.billableHours ?? null,
          },
          asOf,
        ),
        firstIn: record?.firstIn ?? null,
        available: openNow.has(employee.id),
      };
    });

    return { rows, dayKey, isToday, asOf };
  }

  /**
   * Employees with an open session right now (their latest event today is not a
   * clock-out). A bare biometric tap counts as open, matching the auto-clock-out
   * engine: a tap marks presence until an explicit OUT closes it.
   */
  private async openSessionEmployeeIds(employeeIds: string[]): Promise<Set<string>> {
    if (employeeIds.length === 0) return new Set();

    const { start, end } = getAttendanceDayRange(getAttendanceDayKey(new Date()));
    const events = await this.prisma.attendanceEvent.findMany({
      where: { employeeId: { in: employeeIds }, timestamp: { gte: start, lt: end } },
      orderBy: { timestamp: 'asc' },
      select: { employeeId: true, eventType: true },
    });

    // Ascending order means the last write per employee is their latest event.
    const latestByEmployee = new Map<string, (typeof events)[number]['eventType']>();
    for (const event of events) {
      latestByEmployee.set(event.employeeId, event.eventType);
    }

    const open = new Set<string>();
    for (const [employeeId, eventType] of latestByEmployee) {
      if (!OUT_EVENT_TYPES.has(eventType)) open.add(employeeId);
    }
    return open;
  }

  /**
   * The inclusive day-key range for a scoreboard window: the day itself, the
   * Monday-Sunday week around it, or its calendar month. All anchored to the
   * company-local calendar.
   */
  private periodRange(date: string | undefined, period: TardinessPeriod): { from: Date; to: Date } {
    const anchor = date ? parseAttendanceDate(date) : getAttendanceDayKey(new Date());

    if (period === 'daily') {
      return { from: anchor, to: anchor };
    }

    // Local calendar parts for the anchor day.
    const local = new Date(anchor.getTime() + OFFSET_MS);

    if (period === 'weekly') {
      const daysFromMonday = (local.getUTCDay() + 6) % 7;
      const from = new Date(anchor.getTime() - daysFromMonday * DAY_MS);
      return { from, to: new Date(from.getTime() + 6 * DAY_MS) };
    }

    const year = local.getUTCFullYear();
    const month = local.getUTCMonth();
    return {
      from: new Date(Date.UTC(year, month, 1) - OFFSET_MS),
      to: new Date(Date.UTC(year, month + 1, 0) - OFFSET_MS),
    };
  }
}

/** Map a full day status onto the coarser board bucket. */
function toFilter(status: AttendanceStatus): BoardStatusFilter {
  switch (status) {
    case 'present':
      return 'present';
    case 'late':
      return 'late';
    case 'absent':
      return 'absent';
    case 'upcoming':
      return 'upcoming';
    default:
      return 'off';
  }
}

/** Case-insensitive name/email/code match for employee search. */
function searchOr(search: string): Prisma.UserWhereInput[] {
  return [
    { name: { contains: search, mode: 'insensitive' } },
    { email: { contains: search, mode: 'insensitive' } },
    { employeeCode: { contains: search, mode: 'insensitive' } },
  ];
}
