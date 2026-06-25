import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AttendanceOrigin, Prisma } from '@prisma/client';

import { PrismaService } from '../../core/database/prisma.service';
import { PaginatedResponse, buildPaginationMeta } from 'src/common/responses/paginated-api.response';
import { CreateAttendanceEventDTO } from './dto/create-attendance-event.dto';
import { GetAttendanceHistoryQueryDTO } from './dto/get-attendance-history-query.dto';
import { GetRosterQueryDTO } from './dto/get-roster-query.dto';
import {
  AttendanceEventRecord,
  AttendanceRecord,
  DailyAttendanceSummary,
  EVENT_TYPE_SOURCE,
  ORG_MANAGER_ROLES,
  RosterEntry,
} from './constants/attendance.constants';
import {
  computeBillableHours,
  getAttendanceDayKey,
  getAttendanceDayRange,
  parseAttendanceDate,
} from './utils/attendance-day.util';

@Injectable()
export class AttendanceService {
  constructor(private prisma: PrismaService) {}

  /**
   * Record a manual field/WFH event for the employee and recompute the affected
   * day so `firstIn` / `lastOut` / `billableHours` stay materialized. The event
   * and the recompute are atomic — a failed recompute rolls back the event.
   */
  async recordAttendanceEvent(
    employeeId: string,
    body: CreateAttendanceEventDTO,
  ): Promise<AttendanceEventRecord> {
    const timestamp = this.resolveEventTimestamp(body.timestamp);
    const source = EVENT_TYPE_SOURCE[body.eventType];

    return this.prisma.$transaction(async (tx) => {
      const event = await tx.attendanceEvent.create({
        data: {
          employeeId,
          eventType: body.eventType,
          source,
          origin: AttendanceOrigin.MANUAL,
          timestamp,
        },
      });

      await this.recomputeAttendanceDay(tx, employeeId, getAttendanceDayKey(timestamp));

      return event;
    });
  }

  /** Paginated list of the employee's computed daily attendance, newest first. */
  async getMyAttendanceHistory(
    employeeId: string,
    query: GetAttendanceHistoryQueryDTO,
  ): Promise<PaginatedResponse<AttendanceRecord>> {
    const { page, limit, fromDate, toDate } = query;
    const dateFilter = this.buildDayKeyFilter(fromDate, toDate);

    const where: Prisma.AttendanceWhereInput = {
      employeeId,
      ...(dateFilter ? { date: dateFilter } : {}),
    };

    const [data, total] = await Promise.all([
      this.prisma.attendance.findMany({
        where,
        orderBy: { date: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.attendance.count({ where }),
    ]);

    return { data, meta: buildPaginationMeta(total, page, limit) };
  }

  /** Paginated raw event timeline for the employee, newest first. */
  async getMyAttendanceEvents(
    employeeId: string,
    query: GetAttendanceHistoryQueryDTO,
  ): Promise<PaginatedResponse<AttendanceEventRecord>> {
    const { page, limit, fromDate, toDate } = query;
    const timestampFilter = this.buildTimestampFilter(fromDate, toDate);

    const where: Prisma.AttendanceEventWhereInput = {
      employeeId,
      ...(timestampFilter ? { timestamp: timestampFilter } : {}),
    };

    const [data, total] = await Promise.all([
      this.prisma.attendanceEvent.findMany({
        where,
        orderBy: { timestamp: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.attendanceEvent.count({ where }),
    ]);

    return { data, meta: buildPaginationMeta(total, page, limit) };
  }

  /**
   * Computed attendance for a single day (defaults to today), including the
   * underlying ordered timeline so the client can show how first-in/last-out
   * were derived.
   */
  async getDailyAttendance(employeeId: string, date?: string): Promise<DailyAttendanceSummary> {
    const dayKey = date ? parseAttendanceDate(date) : getAttendanceDayKey(new Date());
    const { start, end } = getAttendanceDayRange(dayKey);

    const [attendance, events] = await Promise.all([
      this.prisma.attendance.findUnique({
        where: { employeeId_date: { employeeId, date: dayKey } },
      }),
      this.prisma.attendanceEvent.findMany({
        where: { employeeId, timestamp: { gte: start, lt: end } },
        orderBy: { timestamp: 'asc' },
      }),
    ]);

    return {
      date: dayKey,
      firstIn: attendance?.firstIn ?? null,
      lastOut: attendance?.lastOut ?? null,
      billableHours: attendance?.billableHours ?? null,
      events,
    };
  }

  /**
   * Roster of first-in / last-out / clocked hours for a day. Org managers see
   * every employee; everyone else sees only their own row.
   */
  async getOrganizationRoster(
    organizationId: string,
    callerId: string,
    query: GetRosterQueryDTO,
  ): Promise<PaginatedResponse<RosterEntry>> {
    const { page, limit, date, search } = query;
    const dayKey = date ? parseAttendanceDate(date) : getAttendanceDayKey(new Date());
    const manager = await this.isOrgManager(callerId, organizationId);

    const where: Prisma.MemberWhereInput = manager
      ? {
          organizationId,
          ...(search
            ? {
                user: {
                  OR: [
                    { name: { contains: search, mode: 'insensitive' } },
                    { email: { contains: search, mode: 'insensitive' } },
                    { employeeCode: { contains: search, mode: 'insensitive' } },
                  ],
                },
              }
            : {}),
        }
      : { organizationId, userId: callerId };

    const [members, total] = await Promise.all([
      this.prisma.member.findMany({
        where,
        select: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              employeeCode: true,
              teamMembers: {
                where: { team: { organizationId } },
                select: { team: { select: { name: true } } },
                take: 1,
              },
            },
          },
        },
        orderBy: { user: { name: 'asc' } },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.member.count({ where }),
    ]);

    const employeeIds = members.map((member) => member.user.id);
    const attendances = await this.prisma.attendance.findMany({
      where: { employeeId: { in: employeeIds }, date: dayKey },
    });
    const byEmployee = new Map(attendances.map((record) => [record.employeeId, record]));

    const data: RosterEntry[] = members.map((member) => {
      const attendance = byEmployee.get(member.user.id);
      return {
        employeeId: member.user.id,
        name: member.user.name,
        email: member.user.email,
        employeeCode: member.user.employeeCode,
        department: member.user.teamMembers[0]?.team.name ?? null,
        firstIn: attendance?.firstIn ?? null,
        lastOut: attendance?.lastOut ?? null,
        clockedHours: attendance?.billableHours ?? null,
      };
    });

    return { data, meta: buildPaginationMeta(total, page, limit) };
  }

  /** A single employee's day timeline for the roster drill-down. */
  async getEmployeeDayAttendance(
    organizationId: string,
    callerId: string,
    employeeId: string,
    date?: string,
  ): Promise<DailyAttendanceSummary> {
    await this.assertCanViewEmployee(organizationId, callerId, employeeId);
    return this.getDailyAttendance(employeeId, date);
  }

  /** A single employee's paginated daily history for the roster drill-down. */
  async getEmployeeHistory(
    organizationId: string,
    callerId: string,
    employeeId: string,
    query: GetAttendanceHistoryQueryDTO,
  ): Promise<PaginatedResponse<AttendanceRecord>> {
    await this.assertCanViewEmployee(organizationId, callerId, employeeId);
    return this.getMyAttendanceHistory(employeeId, query);
  }

  /** Managers may view anyone in the org; everyone else only themselves. */
  private async assertCanViewEmployee(
    organizationId: string,
    callerId: string,
    employeeId: string,
  ): Promise<void> {
    if (employeeId !== callerId && !(await this.isOrgManager(callerId, organizationId))) {
      throw new ForbiddenException('You may only view your own attendance.');
    }

    const member = await this.prisma.member.findFirst({
      where: { userId: employeeId, organizationId },
      select: { id: true },
    });
    if (!member) {
      throw new NotFoundException('Employee not found in this organization.');
    }
  }

  private async isOrgManager(userId: string, organizationId: string): Promise<boolean> {
    const member = await this.prisma.member.findFirst({
      where: { userId, organizationId },
      select: { role: true },
    });
    return !!member && (ORG_MANAGER_ROLES as readonly string[]).includes(member.role);
  }

  /**
   * First-in / last-out / billable-hours engine for one day. Recomputes from the
   * full set of events in the local day and upserts the materialized record;
   * if no events remain, the stale record is removed.
   */
  private async recomputeAttendanceDay(
    tx: Prisma.TransactionClient,
    employeeId: string,
    dayKey: Date,
  ): Promise<void> {
    const { start, end } = getAttendanceDayRange(dayKey);

    const bounds = await tx.attendanceEvent.aggregate({
      where: { employeeId, timestamp: { gte: start, lt: end } },
      _min: { timestamp: true },
      _max: { timestamp: true },
    });

    const firstIn = bounds._min.timestamp;
    const lastOut = bounds._max.timestamp;

    if (!firstIn || !lastOut) {
      await tx.attendance.deleteMany({ where: { employeeId, date: start } });
      return;
    }

    const billableHours = computeBillableHours(firstIn, lastOut);

    await tx.attendance.upsert({
      where: { employeeId_date: { employeeId, date: start } },
      create: { employeeId, date: start, firstIn, lastOut, billableHours },
      update: { firstIn, lastOut, billableHours },
    });
  }

  private resolveEventTimestamp(raw: string | undefined): Date {
    if (!raw) {
      return new Date();
    }
    const timestamp = new Date(raw);
    if (timestamp.getTime() > Date.now()) {
      throw new BadRequestException('Attendance timestamp cannot be in the future.');
    }
    return timestamp;
  }

  /** Filter on the stored day-key (local midnight), inclusive on both ends. */
  private buildDayKeyFilter(
    fromDate: string | undefined,
    toDate: string | undefined,
  ): Prisma.DateTimeFilter | undefined {
    if (!fromDate && !toDate) {
      return undefined;
    }
    return {
      ...(fromDate ? { gte: parseAttendanceDate(fromDate) } : {}),
      ...(toDate ? { lte: parseAttendanceDate(toDate) } : {}),
    };
  }

  /** Filter on event timestamps, inclusive of the whole `toDate` local day. */
  private buildTimestampFilter(
    fromDate: string | undefined,
    toDate: string | undefined,
  ): Prisma.DateTimeFilter | undefined {
    if (!fromDate && !toDate) {
      return undefined;
    }
    return {
      ...(fromDate ? { gte: getAttendanceDayRange(parseAttendanceDate(fromDate)).start } : {}),
      ...(toDate ? { lt: getAttendanceDayRange(parseAttendanceDate(toDate)).end } : {}),
    };
  }
}
