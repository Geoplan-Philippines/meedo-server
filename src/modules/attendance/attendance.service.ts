import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { AttendanceEventType, AttendanceOrigin, AttendanceSource, Prisma } from '@prisma/client';

import { PrismaService } from '../../core/database/prisma.service';
import { PaginatedResponse, buildPaginationMeta } from 'src/common/responses/paginated-api.response';
import {
  BiometricIngestResult,
  BiometricTap,
  OFFICE_LOCATION,
} from './biometrics/biometrics.constants';
import { CreateAttendanceEventDTO } from './dto/create-attendance-event.dto';
import { GetAttendanceHistoryQueryDTO } from './dto/get-attendance-history-query.dto';
import { GetRosterQueryDTO } from './dto/get-roster-query.dto';
import {
  AttendanceEventRecord,
  AttendanceRecord,
  DailyAttendanceSummary,
  EVENT_TYPE_SOURCE,
  ORG_MANAGER_ROLES,
  OUT_EVENT_TYPES,
  RosterEntry,
  RosterResult,
  SOURCE_AUTO_OUT_EVENT,
} from './constants/attendance.constants';
import {
  computeBillableHours,
  getAttendanceDayKey,
  getAttendanceDayRange,
  getAutoClockOutInstant,
  parseAttendanceDate,
  toCompanyOffsetIso,
} from './utils/attendance-day.util';

@Injectable()
export class AttendanceService {
  private readonly logger = new Logger(AttendanceService.name);

  constructor(private prisma: PrismaService) {}

  async getRegisteredBiometricIds(): Promise<string[]> {
    const users = await this.prisma.user.findMany({
      where: { biometricsId: { not: null } },
      select: { biometricsId: true },
    });
    return users
      .map((user) => user.biometricsId)
      .filter((biometricsId): biometricsId is string => Boolean(biometricsId));
  }

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
          latitude: body.latitude,
          longitude: body.longitude,
        },
      });

      await this.recomputeAttendanceDay(tx, employeeId, getAttendanceDayKey(timestamp));

      return event;
    });
  }

  /**
   * Idempotently ingest raw biometric door taps as `OFFICE_ACCESS` events and
   * recompute every affected day. Taps whose `externalId` already exists are
   * skipped, so overlapping poll windows never double-count; taps for unknown
   * biometric IDs are ignored. Returns the number of new events stored.
   *
   * A tap is just a presence mark: the day's first tap becomes `firstIn`, but a
   * bare tap never closes the day, so `lastOut` stays null until an explicit OUT
   * or the auto-clock-out at the cutoff. A lone tap with no closing punch stays
   * "open" and is auto-clocked-out at the cutoff hour.
   */
  async ingestBiometricAccess(taps: BiometricTap[]): Promise<number> {
    return (await this.ingestBiometricAccessDetailed(taps)).ingested;
  }

  /** Ingest a batch and report an explicit outcome for every unique device event. */
  async ingestBiometricAccessDetailed(taps: BiometricTap[]): Promise<BiometricIngestResult> {
    if (taps.length === 0) {
      return { ingested: 0, duplicates: 0, unknown: 0, results: [], affected: [] };
    }

    const unique = [...new Map(taps.map((tap) => [tap.externalId, tap])).values()];
    const existing = await this.prisma.attendanceEvent.findMany({
      where: { externalId: { in: unique.map((tap) => tap.externalId) } },
      select: { externalId: true },
    });
    const existingIds = new Set(existing.map((event) => event.externalId));
    const fresh = unique.filter((tap) => !existingIds.has(tap.externalId));
    if (fresh.length === 0) {
      return {
        ingested: 0,
        duplicates: unique.length,
        unknown: 0,
        results: unique.map((tap) => ({ externalId: tap.externalId, status: 'duplicate' })),
        affected: [],
      };
    }

    const biometricIds = [...new Set(fresh.map((tap) => tap.biometricsId))];
    const users = await this.prisma.user.findMany({
      where: { biometricsId: { in: biometricIds } },
      select: { id: true, biometricsId: true },
    });
    const employeeIdByBiometricId = new Map(users.map((user) => [user.biometricsId, user.id]));

    const known = fresh.flatMap((tap) => {
      const employeeId = employeeIdByBiometricId.get(tap.biometricsId);
      return employeeId ? [{ tap, employeeId }] : [];
    });
    const knownByExternalId = new Map(known.map((item) => [item.tap.externalId, item]));

    const created = known.length === 0 ? [] : await this.prisma.$transaction(async (tx) => {
      const rows = await tx.attendanceEvent.createManyAndReturn({
        data: known.map(({ tap, employeeId }) => ({
          employeeId,
          eventType: AttendanceEventType.OFFICE_ACCESS,
          source: AttendanceSource.OFFICE,
          origin: AttendanceOrigin.BIOMETRICS,
          timestamp: tap.timestamp,
          externalId: tap.externalId,
          latitude: OFFICE_LOCATION.latitude,
          longitude: OFFICE_LOCATION.longitude,
        })),
        skipDuplicates: true,
        select: { externalId: true, employeeId: true, timestamp: true },
      });

      const affectedDays = new Map<string, { employeeId: string; dayKey: Date }>();
      for (const row of rows) {
        const dayKey = getAttendanceDayKey(row.timestamp);
        affectedDays.set(`${row.employeeId}:${dayKey.getTime()}`, {
          employeeId: row.employeeId,
          dayKey,
        });
      }
      for (const { employeeId, dayKey } of affectedDays.values()) {
        await this.recomputeAttendanceDay(tx, employeeId, dayKey);
      }
      return rows;
    });

    const createdIds = new Set(created.map((row) => row.externalId));
    const results = unique.map((tap) => {
      if (existingIds.has(tap.externalId)) {
        return { externalId: tap.externalId, status: 'duplicate' as const };
      }
      if (!knownByExternalId.has(tap.externalId)) {
        return { externalId: tap.externalId, status: 'unknown_biometrics_id' as const };
      }
      return {
        externalId: tap.externalId,
        status: createdIds.has(tap.externalId) ? 'ingested' as const : 'duplicate' as const,
      };
    });
    const affected = created.map((row) => ({
      employeeId: row.employeeId,
      date: toCompanyOffsetIso(getAttendanceDayKey(row.timestamp)).slice(0, 10),
    }));

    return {
      ingested: results.filter((result) => result.status === 'ingested').length,
      duplicates: results.filter((result) => result.status === 'duplicate').length,
      unknown: results.filter((result) => result.status === 'unknown_biometrics_id').length,
      results,
      affected: [...new Map(affected.map((target) => [
        `${target.employeeId}:${target.date}`,
        target,
      ])).values()],
    };
  }

  /**
   * Close out every employee still clocked in for the current local day by
   * stamping a system OUT at the auto-clock-out cutoff (18:00 Asia/Manila).
   *
   * Only sessions whose latest event is still an "in" and falls before the
   * cutoff are closed; anyone who already clocked out — or who later punches out
   * past 18:00 — keeps their real `lastOut`, since the recompute takes the
   * timestamp of the day's latest OUT event. Re-running is safe: an auto-closed
   * day's latest event is now an OUT, so it is skipped. Returns the number of
   * sessions closed.
   */
  async runAutoClockOut(now: Date = new Date()): Promise<number> {
    const dayKey = getAttendanceDayKey(now);
    const { start, end } = getAttendanceDayRange(dayKey);
    const cutoff = getAutoClockOutInstant(now);

    const events = await this.prisma.attendanceEvent.findMany({
      where: { timestamp: { gte: start, lt: end } },
      orderBy: { timestamp: 'asc' },
      select: { employeeId: true, eventType: true, source: true, timestamp: true },
    });

    // Events are ordered ascending, so the last write per employee is their
    // latest event of the day.
    const latestByEmployee = new Map<string, (typeof events)[number]>();
    for (const event of events) {
      latestByEmployee.set(event.employeeId, event);
    }

    let closed = 0;
    for (const [employeeId, latest] of latestByEmployee) {
      if (!this.isOpenSession(latest.eventType, latest.timestamp, cutoff)) {
        continue;
      }
      if (await this.createAutoClockOut(employeeId, latest.source, cutoff, dayKey)) {
        closed += 1;
      }
    }

    if (closed > 0) {
      this.logger.log(`Auto-clocked out ${closed} open session(s) at ${cutoff.toISOString()}.`);
    }
    return closed;
  }

  /**
   * A session is still open when its latest event is not an OUT and falls before
   * the cutoff. A bare `OFFICE_ACCESS` biometric tap is intentionally "open": a
   * door tap marks presence but never closes the day, so someone who tapped in
   * and forgot to clock out is auto-closed at the cutoff hour rather than left
   * dangling. Only the explicit OUT types in `OUT_EVENT_TYPES` end a session.
   */
  private isOpenSession(eventType: AttendanceEventType, timestamp: Date, cutoff: Date): boolean {
    return !OUT_EVENT_TYPES.has(eventType) && timestamp < cutoff;
  }

  /**
   * Persist the system OUT and recompute the day atomically. Returns whether an
   * OUT was actually written: the bulk read in `runAutoClockOut` can go stale if
   * the employee punches out between that read and here, so the latest event is
   * re-checked inside the transaction and the AUTO OUT is skipped if the session
   * is no longer open — avoiding a phantom AUTO entry next to a real punch-out.
   */
  private async createAutoClockOut(
    employeeId: string,
    source: AttendanceSource,
    cutoff: Date,
    dayKey: Date,
  ): Promise<boolean> {
    const { start, end } = getAttendanceDayRange(dayKey);

    return this.prisma.$transaction(async (tx) => {
      const latest = await tx.attendanceEvent.findFirst({
        where: { employeeId, timestamp: { gte: start, lt: end } },
        orderBy: { timestamp: 'desc' },
        select: { eventType: true, timestamp: true },
      });
      if (!latest || !this.isOpenSession(latest.eventType, latest.timestamp, cutoff)) {
        return false;
      }

      await tx.attendanceEvent.create({
        data: {
          employeeId,
          eventType: SOURCE_AUTO_OUT_EVENT[source],
          source,
          origin: AttendanceOrigin.AUTO,
          timestamp: cutoff,
        },
      });
      await this.recomputeAttendanceDay(tx, employeeId, dayKey);
      return true;
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
   * Roster of first-in / last-out / clocked hours for a day. Only employees who
   * actually have attendance for the day appear — days with none come back empty
   * so the client can show its "no data yet" state instead of dashed rows. Org
   * managers see everyone; everyone else sees only their own row.
   */
  async getOrganizationRoster(
    organizationId: string,
    callerId: string,
    query: GetRosterQueryDTO,
  ): Promise<RosterResult> {
    const { page, limit, date, search } = query;
    const dayKey = date ? parseAttendanceDate(date) : getAttendanceDayKey(new Date());
    const manager = await this.isOrgManager(callerId, organizationId);

    const employee: Prisma.UserWhereInput = manager
      ? {
          members: { some: { organizationId } },
          ...(search
            ? {
                OR: [
                  { name: { contains: search, mode: 'insensitive' } },
                  { email: { contains: search, mode: 'insensitive' } },
                  { employeeCode: { contains: search, mode: 'insensitive' } },
                ],
              }
            : {}),
        }
      : { id: callerId, members: { some: { organizationId } } };

    const where: Prisma.AttendanceWhereInput = { date: dayKey, employee };

    const [records, total] = await Promise.all([
      this.prisma.attendance.findMany({
        where,
        select: {
          firstIn: true,
          lastOut: true,
          billableHours: true,
          employee: {
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
        orderBy: { employee: { name: 'asc' } },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.attendance.count({ where }),
    ]);

    const data: RosterEntry[] = records.map((record) => ({
      employeeId: record.employee.id,
      name: record.employee.name,
      email: record.employee.email,
      employeeCode: record.employee.employeeCode,
      department: record.employee.teamMembers[0]?.team.name ?? null,
      firstIn: record.firstIn,
      lastOut: record.lastOut,
      clockedHours: record.billableHours,
    }));

    return {
      data,
      meta: { ...buildPaginationMeta(total, page, limit), viewerIsManager: manager },
    };
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

  /** Guard for manager-only actions (e.g. triggering a biometric sync by hand). */
  async assertOrgManager(callerId: string, organizationId: string): Promise<void> {
    if (!(await this.isOrgManager(callerId, organizationId))) {
      throw new ForbiddenException('Only organization managers may perform this action.');
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
    const window = { employeeId, timestamp: { gte: start, lt: end } };

    const [firstInEvent, latestEvent] = await Promise.all([
      // `firstIn` is anchored to the day's first genuine clock-in / presence
      // event, so OUT types are excluded here. An OUT with no prior IN (a stray
      // biometric OUT, or a forgotten clock-in) must never seed `firstIn` — that
      // would otherwise make the OUT both first-in and last-out and materialize a
      // bogus 0-hour record.
      tx.attendanceEvent.findFirst({
        where: { ...window, eventType: { notIn: [...OUT_EVENT_TYPES] } },
        orderBy: { timestamp: 'asc' },
        select: { timestamp: true },
      }),
      tx.attendanceEvent.findFirst({
        where: window,
        orderBy: { timestamp: 'desc' },
        select: { timestamp: true, eventType: true },
      }),
    ]);

    // No genuine clock-in means there is no session to materialize: a day of only
    // orphan OUT events is treated the same as a day with no events at all. The
    // raw OUT events still remain queryable in the timeline for audit.
    if (!firstInEvent) {
      await tx.attendance.deleteMany({ where: { employeeId, date: start } });
      return;
    }

    const firstIn = firstInEvent.timestamp;

    // The day is closed only once its latest event is an explicit clock-out
    // (`OUT_EVENT_TYPES`); until then the session is still open. A lone clock-in
    // — or any run of in/presence events with no closing punch — therefore keeps
    // lastOut/billableHours null instead of back-filling a last-out equal to the
    // first-in. A bare biometric tap never closes the day (see `isOpenSession`),
    // so it stays open until the real OUT or the auto-clock-out at the cutoff.
    // With `firstIn` gated to a real IN, a latest OUT is always at/after it, so
    // `billableHours` can never go negative.
    const lastOut =
      latestEvent && OUT_EVENT_TYPES.has(latestEvent.eventType) ? latestEvent.timestamp : null;
    const billableHours = lastOut ? computeBillableHours(firstIn, lastOut) : null;

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
