import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, TimesheetAuditAction, TimesheetEntryStatus } from '@prisma/client';
import ExcelJS from 'exceljs';

import { PrismaService } from '../../../core/database/prisma.service';
import { isOrgAdminRole } from '../../../common/constants/org-roles.constants';
import { PaginatedResponse, buildPaginationMeta } from '../../../common/responses/paginated-api.response';
import { BulkApproveTimesheetEntriesDTO } from './dto/bulk-approve-timesheet-entries.dto';
import { BulkRejectTimesheetEntriesDTO } from './dto/bulk-reject-timesheet-entries.dto';
import { CreateTimesheetEntryDTO } from './dto/create-timesheet-entry.dto';
import { GetTimesheetAuditLogsQueryDTO } from './dto/get-timesheet-audit-logs-query.dto';
import { GetTimesheetEntriesQueryDTO } from './dto/get-timesheet-entries-query.dto';
import { GetTimesheetPeriodLockQueryDTO } from './dto/get-timesheet-period-lock-query.dto';
import { GetTimesheetProjectsQueryDTO } from './dto/get-timesheet-projects-query.dto';
import { GetTimesheetSummaryQueryDTO } from './dto/get-timesheet-summary-query.dto';
import { LockTimesheetPeriodDTO } from './dto/lock-timesheet-period.dto';
import { SubmitTimesheetWeekDTO } from './dto/submit-timesheet-week.dto';
import { UnlockTimesheetPeriodDTO } from './dto/unlock-timesheet-period.dto';
import { UpdateTimesheetEntryDTO } from './dto/update-timesheet-entry.dto';

const MAX_REGULAR_HOURS_PER_DAY = 9;
const MAX_TOTAL_HOURS_PER_DAY = 24;

const TIMESHEET_ENTRY_INCLUDE = {
  project: {
    select: {
      id:              true,
      customerName:    true,
      workOrderNumber: true,
      status:          true,
    },
  },
  approvedBy: {
    select: {
      id:   true,
      user: { select: { id: true, name: true, email: true } },
    },
  },
  rejectedBy: {
    select: {
      id:   true,
      user: { select: { id: true, name: true, email: true } },
    },
  },
} satisfies Prisma.TimesheetEntryInclude;

const TIMESHEET_SUMMARY_ENTRY_INCLUDE = {
  project: {
    select: {
      id:              true,
      customerName:    true,
      workOrderNumber: true,
      status:          true,
    },
  },
  user: {
    select: {
      id:           true,
      name:         true,
      email:        true,
      employeeCode: true,
      teamMembers: {
        select: { team: { select: { id: true, name: true, organizationId: true } } },
      },
    },
  },
  approvedBy: {
    select: {
      id:   true,
      user: { select: { id: true, name: true, email: true } },
    },
  },
  rejectedBy: {
    select: {
      id:   true,
      user: { select: { id: true, name: true, email: true } },
    },
  },
} satisfies Prisma.TimesheetEntryInclude;

const TIMESHEET_PERIOD_LOCK_INCLUDE = {
  lockedBy: { select: { id: true, user: { select: { id: true, name: true, email: true } } } },
  unlockedBy: { select: { id: true, user: { select: { id: true, name: true, email: true } } } },
} satisfies Prisma.TimesheetPeriodLockInclude;

const TIMESHEET_AUDIT_LOG_INCLUDE = {
  actor: { select: { id: true, role: true, user: { select: { id: true, name: true, email: true } } } },
  targetUser: { select: { id: true, name: true, email: true } },
  timesheetEntry: {
    select: {
      id: true,
      workDate: true,
      hours: true,
      status: true,
      project: { select: { id: true, customerName: true, workOrderNumber: true } },
    },
  },
} satisfies Prisma.TimesheetAuditLogInclude;

type TimesheetEntryWithRelations = Prisma.TimesheetEntryGetPayload<{ include: typeof TIMESHEET_ENTRY_INCLUDE }>;
type TimesheetSummaryEntry = Prisma.TimesheetEntryGetPayload<{ include: typeof TIMESHEET_SUMMARY_ENTRY_INCLUDE }>;
type TimesheetAuditLogWithRelations = Prisma.TimesheetAuditLogGetPayload<{ include: typeof TIMESHEET_AUDIT_LOG_INCLUDE }>;

interface TimesheetExportResult {
  buffer: Buffer;
  filename: string;
  mimeType: string;
}

@Injectable()
export class TimesheetService {
  constructor(private prisma: PrismaService) {}

  async getEntries(
    organizationId: string,
    userId: string | undefined,
    query: GetTimesheetEntriesQueryDTO,
  ): Promise<PaginatedResponse<TimesheetEntryWithRelations>> {
    await this.resolveMember(organizationId, userId);

    const { page, limit } = query;
    const where: Prisma.TimesheetEntryWhereInput = {
      organizationId,
      userId,
      ...(query.projectId ? { projectId: query.projectId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...this.buildWorkDateFilter(query.periodStart, query.periodEnd),
    };

    const [entries, total] = await Promise.all([
      this.prisma.timesheetEntry.findMany({
        where,
        include: TIMESHEET_ENTRY_INCLUDE,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: [{ workDate: 'asc' }, { createdAt: 'asc' }],
      }),
      this.prisma.timesheetEntry.count({ where }),
    ]);

    return { data: entries, meta: buildPaginationMeta(total, page, limit) };
  }

  async createEntry(
    organizationId: string,
    userId: string | undefined,
    dto: CreateTimesheetEntryDTO,
  ): Promise<TimesheetEntryWithRelations> {
    const member = await this.resolveMember(organizationId, userId);
    await this.ensureProjectInOrganization(dto.projectId, organizationId);
    const workDate = parseDateOnly(dto.workDate);
    await this.ensureDateNotLocked(organizationId, workDate);
    await this.ensureDailyHoursLimit(organizationId, userId!, workDate, dto.hours, dto.isOvertime ?? false);

    const data = {
      organizationId,
      userId: userId!,
      projectId: dto.projectId,
      workDate,
      hours: dto.hours,
      location: dto.location?.trim() || undefined,
      workType: dto.workType,
      task: dto.task.trim(),
      projectDescription: normalizeOptionalString(dto.projectDescription),
      isOvertime: dto.isOvertime ?? false,
      isNightDifferential: dto.isNightDifferential ?? false,
      status: TimesheetEntryStatus.DRAFT,
    } satisfies Prisma.TimesheetEntryUncheckedCreateInput;

    return this.prisma.$transaction(async (tx) => {
      const entry = await tx.timesheetEntry.create({
        data,
        include: TIMESHEET_ENTRY_INCLUDE,
      });

      await tx.timesheetAuditLog.create({
        data: {
          organizationId,
          actorMemberId: member.id,
          targetUserId: userId!,
          timesheetEntryId: entry.id,
          action: TimesheetAuditAction.CREATED,
          after: toJson(entry),
        },
      });

      return entry;
    });
  }

  async updateEntry(
    entryId: string,
    organizationId: string,
    userId: string | undefined,
    dto: UpdateTimesheetEntryDTO,
  ): Promise<TimesheetEntryWithRelations> {
    const member = await this.resolveMember(organizationId, userId);
    const existing = await this.findOwnEntryOrThrow(entryId, organizationId, userId!);

    this.assertCanEdit(existing.status);

    if (dto.projectId) {
      await this.ensureProjectInOrganization(dto.projectId, organizationId);
    }

    const workDate = dto.workDate !== undefined ? parseDateOnly(dto.workDate) : existing.workDate;
    const hours = dto.hours !== undefined ? dto.hours : existing.hours;
    const isOvertime = dto.isOvertime !== undefined ? dto.isOvertime : existing.isOvertime;
    await this.ensureDateNotLocked(organizationId, existing.workDate);
    await this.ensureDateNotLocked(organizationId, workDate);
    await this.ensureDailyHoursLimit(organizationId, userId!, workDate, hours, isOvertime, entryId);

    const data: Prisma.TimesheetEntryUncheckedUpdateInput = {
      ...(dto.projectId !== undefined ? { projectId: dto.projectId } : {}),
      ...(dto.workDate !== undefined ? { workDate } : {}),
      ...(dto.hours !== undefined ? { hours: dto.hours } : {}),
      ...(dto.location !== undefined ? { location: dto.location.trim() || 'OFC - DW' } : {}),
      ...(dto.workType !== undefined ? { workType: dto.workType } : {}),
      ...(dto.task !== undefined ? { task: dto.task.trim() } : {}),
      ...(dto.projectDescription !== undefined
        ? { projectDescription: normalizeOptionalString(dto.projectDescription) }
        : {}),
      ...(dto.isOvertime !== undefined ? { isOvertime: dto.isOvertime } : {}),
      ...(dto.isNightDifferential !== undefined ? { isNightDifferential: dto.isNightDifferential } : {}),
      // Editing a rejected entry returns it to draft; a submitted entry stays pending after edits.
      ...(existing.status === TimesheetEntryStatus.REJECTED
        ? {
            status: TimesheetEntryStatus.DRAFT,
            rejectedAt: null,
            rejectedByMemberId: null,
            rejectionReason: null,
          }
        : {}),
    };

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.timesheetEntry.update({
        where: { id: entryId },
        data,
        include: TIMESHEET_ENTRY_INCLUDE,
      });

      await tx.timesheetAuditLog.create({
        data: {
          organizationId,
          actorMemberId: member.id,
          targetUserId: userId!,
          timesheetEntryId: updated.id,
          action: TimesheetAuditAction.UPDATED,
          before: toJson(existing),
          after: toJson(updated),
        },
      });

      return updated;
    });
  }

  async deleteEntry(
    entryId: string,
    organizationId: string,
    userId: string | undefined,
  ): Promise<void> {
    const member = await this.resolveMember(organizationId, userId);
    const existing = await this.findOwnEntryOrThrow(entryId, organizationId, userId!);

    this.assertCanDelete(existing.status);

    await this.ensureDateNotLocked(organizationId, existing.workDate);

    await this.prisma.$transaction(async (tx) => {
      await tx.timesheetAuditLog.create({
        data: {
          organizationId,
          actorMemberId: member.id,
          targetUserId: userId!,
          timesheetEntryId: existing.id,
          action: TimesheetAuditAction.DELETED,
          before: toJson(existing),
        },
      });

      await tx.timesheetEntry.delete({ where: { id: entryId } });
    });
  }

  async submitWeek(
    organizationId: string,
    userId: string | undefined,
    dto: SubmitTimesheetWeekDTO,
  ) {
    const member = await this.resolveMember(organizationId, userId);
    const { start, end } = parsePeriodRange(dto.periodStart, dto.periodEnd);
    await this.ensurePeriodNotLocked(organizationId, start, end);

    const entries = await this.prisma.timesheetEntry.findMany({
      where: {
        organizationId,
        userId,
        status: TimesheetEntryStatus.DRAFT,
        workDate: { gte: start, lte: end },
      },
      include: TIMESHEET_ENTRY_INCLUDE,
      orderBy: [{ workDate: 'asc' }, { createdAt: 'asc' }],
    });

    if (entries.length === 0) {
      throw new BadRequestException('No draft timesheet entries found for this period.');
    }

    const submittedAt = new Date();

    return this.prisma.$transaction(async (tx) => {
      await tx.timesheetEntry.updateMany({
        where: { id: { in: entries.map((entry) => entry.id) } },
        data: { status: TimesheetEntryStatus.SUBMITTED, submittedAt },
      });

      await tx.timesheetAuditLog.createMany({
        data: entries.map((entry) => ({
          organizationId,
          actorMemberId: member.id,
          targetUserId: userId!,
          timesheetEntryId: entry.id,
          action: TimesheetAuditAction.SUBMITTED,
          before: toJson(entry),
          after: toJson({ ...entry, status: TimesheetEntryStatus.SUBMITTED, submittedAt }),
        })),
      });

      const submittedEntries = await tx.timesheetEntry.findMany({
        where: { id: { in: entries.map((entry) => entry.id) } },
        include: TIMESHEET_ENTRY_INCLUDE,
        orderBy: [{ workDate: 'asc' }, { createdAt: 'asc' }],
      });

      return { submittedCount: submittedEntries.length, entries: submittedEntries };
    });
  }

  async getSummary(
    organizationId: string,
    userId: string | undefined,
    query: GetTimesheetSummaryQueryDTO,
  ) {
    const member = await this.resolveMember(organizationId, userId);
    this.ensureAdminMember(member.role);

    const { start, end } = parsePeriodRange(query.periodStart, query.periodEnd);
    const where = this.buildSummaryWhere(organizationId, start, end, query);

    const [entries, lock] = await Promise.all([
      this.prisma.timesheetEntry.findMany({
        where,
        include: TIMESHEET_SUMMARY_ENTRY_INCLUDE,
        orderBy: [{ user: { name: 'asc' } }, { workDate: 'asc' }, { createdAt: 'asc' }],
      }),
      this.prisma.timesheetPeriodLock.findUnique({
        where: {
          organizationId_periodStart_periodEnd: {
            organizationId,
            periodStart: start,
            periodEnd: end,
          },
        },
      }),
    ]);

    return buildTimesheetSummary(entries, start, end, lock?.isLocked ?? false, organizationId);
  }

  async bulkApproveEntries(
    organizationId: string,
    userId: string | undefined,
    dto: BulkApproveTimesheetEntriesDTO,
  ) {
    const member = await this.resolveMember(organizationId, userId);
    this.ensureAdminMember(member.role);

    const entries = await this.findApprovalTargetEntries(organizationId, dto.entryIds);
    this.ensureNoSelfApproval(entries, userId!);

    const approvableEntries = entries.filter(
      (entry) => entry.status === TimesheetEntryStatus.SUBMITTED || entry.status === TimesheetEntryStatus.DRAFT,
    );
    if (approvableEntries.length === 0) {
      throw new BadRequestException('No timesheet entries available to approve.');
    }

    const approvedAt = new Date();
    const ids = approvableEntries.map((entry) => entry.id);

    return this.prisma.$transaction(async (tx) => {
      await tx.timesheetEntry.updateMany({
        where: { id: { in: ids }, organizationId, status: { in: [TimesheetEntryStatus.SUBMITTED, TimesheetEntryStatus.DRAFT] } },
        data: {
          status: TimesheetEntryStatus.APPROVED,
          approvedAt,
          approvedByMemberId: member.id,
          rejectedAt: null,
          rejectedByMemberId: null,
          rejectionReason: null,
        },
      });

      await tx.timesheetAuditLog.createMany({
        data: approvableEntries.map((entry) => ({
          organizationId,
          actorMemberId: member.id,
          targetUserId: entry.userId,
          timesheetEntryId: entry.id,
          action: TimesheetAuditAction.APPROVED,
          before: toJson(entry),
          after: toJson({
            ...entry,
            status: TimesheetEntryStatus.APPROVED,
            approvedAt,
            approvedByMemberId: member.id,
            rejectedAt: null,
            rejectedByMemberId: null,
            rejectionReason: null,
          }),
        })),
      });

      const updatedEntries = await tx.timesheetEntry.findMany({
        where: { id: { in: ids } },
        include: TIMESHEET_SUMMARY_ENTRY_INCLUDE,
        orderBy: [{ workDate: 'asc' }, { createdAt: 'asc' }],
      });

      return { approvedCount: updatedEntries.length, entries: updatedEntries };
    });
  }

  async bulkRejectEntries(
    organizationId: string,
    userId: string | undefined,
    dto: BulkRejectTimesheetEntriesDTO,
  ) {
    const member = await this.resolveMember(organizationId, userId);
    this.ensureAdminMember(member.role);

    const reason = dto.reason.trim();
    if (!reason) {
      throw new BadRequestException('Rejection reason is required.');
    }

    const entries = await this.findApprovalTargetEntries(organizationId, dto.entryIds);
    this.ensureNoSelfApproval(entries, userId!);

    const rejectableEntries = entries.filter(
      (entry) => entry.status === TimesheetEntryStatus.SUBMITTED || entry.status === TimesheetEntryStatus.DRAFT,
    );
    if (rejectableEntries.length === 0) {
      throw new BadRequestException('No timesheet entries available to reject.');
    }

    const rejectedAt = new Date();
    const ids = rejectableEntries.map((entry) => entry.id);

    return this.prisma.$transaction(async (tx) => {
      await tx.timesheetEntry.updateMany({
        where: { id: { in: ids }, organizationId, status: { in: [TimesheetEntryStatus.SUBMITTED, TimesheetEntryStatus.DRAFT] } },
        data: {
          status: TimesheetEntryStatus.REJECTED,
          rejectedAt,
          rejectedByMemberId: member.id,
          rejectionReason: reason,
          approvedAt: null,
          approvedByMemberId: null,
        },
      });

      await tx.timesheetAuditLog.createMany({
        data: rejectableEntries.map((entry) => ({
          organizationId,
          actorMemberId: member.id,
          targetUserId: entry.userId,
          timesheetEntryId: entry.id,
          action: TimesheetAuditAction.REJECTED,
          before: toJson(entry),
          after: toJson({
            ...entry,
            status: TimesheetEntryStatus.REJECTED,
            rejectedAt,
            rejectedByMemberId: member.id,
            rejectionReason: reason,
            approvedAt: null,
            approvedByMemberId: null,
          }),
        })),
      });

      const updatedEntries = await tx.timesheetEntry.findMany({
        where: { id: { in: ids } },
        include: TIMESHEET_SUMMARY_ENTRY_INCLUDE,
        orderBy: [{ workDate: 'asc' }, { createdAt: 'asc' }],
      });

      return { rejectedCount: updatedEntries.length, entries: updatedEntries };
    });
  }

  async exportTimesheet(
    organizationId: string,
    userId: string | undefined,
    query: GetTimesheetSummaryQueryDTO,
  ): Promise<TimesheetExportResult> {
    const member = await this.resolveMember(organizationId, userId);
    this.ensureAdminMember(member.role);

    const { start, end } = parsePeriodRange(query.periodStart, query.periodEnd);
    const where = this.buildSummaryWhere(organizationId, start, end, query);

    const [entries, organization, lock, exporter] = await Promise.all([
      this.prisma.timesheetEntry.findMany({
        where,
        include: TIMESHEET_SUMMARY_ENTRY_INCLUDE,
        orderBy: [{ user: { name: 'asc' } }, { workDate: 'asc' }, { createdAt: 'asc' }],
      }),
      this.prisma.organization.findUnique({
        where: { id: organizationId },
        select: { id: true, name: true, slug: true },
      }),
      this.prisma.timesheetPeriodLock.findUnique({
        where: {
          organizationId_periodStart_periodEnd: {
            organizationId,
            periodStart: start,
            periodEnd: end,
          },
        },
      }),
      this.prisma.user.findUnique({
        where: { id: userId! },
        select: { name: true, email: true },
      }),
    ]);

    const workbook = await buildTimesheetWorkbook({
      entries,
      periodStart: start,
      periodEnd: end,
      organizationId,
      organizationName: organization?.name ?? 'Organization',
      organizationSlug: organization?.slug ?? organizationId,
      exportedBy: exporter?.name || exporter?.email || member.id,
      exportedAt: new Date(),
      isLocked: lock?.isLocked ?? false,
    });

    await this.prisma.timesheetAuditLog.create({
      data: {
        organizationId,
        actorMemberId: member.id,
        action: TimesheetAuditAction.EXPORTED,
        after: toJson({
          periodStart: start,
          periodEnd: end,
          filters: query,
          rowCount: entries.length,
        }),
      },
    });

    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
    const filename = `timesheet-${sanitizeFilename(organization?.slug ?? organizationId)}-${toDateInputValue(start)}-to-${toDateInputValue(end)}.xlsx`;

    return {
      buffer,
      filename,
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    };
  }

  async getPeriodLock(
    organizationId: string,
    userId: string | undefined,
    query: GetTimesheetPeriodLockQueryDTO,
  ) {
    await this.resolveMember(organizationId, userId);
    const { start, end } = parsePeriodRange(query.periodStart, query.periodEnd);

    const lock = await this.prisma.timesheetPeriodLock.findUnique({
      where: {
        organizationId_periodStart_periodEnd: {
          organizationId,
          periodStart: start,
          periodEnd: end,
        },
      },
      include: {
        lockedBy: { select: { id: true, user: { select: { id: true, name: true, email: true } } } },
        unlockedBy: { select: { id: true, user: { select: { id: true, name: true, email: true } } } },
      },
    });

    return lock ?? {
      id: null,
      organizationId,
      periodStart: start,
      periodEnd: end,
      isLocked: false,
      lockedAt: null,
      lockedByMemberId: null,
      lockedBy: null,
      unlockedAt: null,
      unlockedByMemberId: null,
      unlockedBy: null,
      unlockReason: null,
      createdAt: null,
      updatedAt: null,
    };
  }

  async lockPeriod(
    organizationId: string,
    userId: string | undefined,
    dto: LockTimesheetPeriodDTO,
  ) {
    const member = await this.resolveMember(organizationId, userId);
    this.ensureOwnerMember(member.role);

    const { start, end } = parsePeriodRange(dto.periodStart, dto.periodEnd);
    const now = new Date();

    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.timesheetPeriodLock.findUnique({
        where: {
          organizationId_periodStart_periodEnd: {
            organizationId,
            periodStart: start,
            periodEnd: end,
          },
        },
        include: TIMESHEET_PERIOD_LOCK_INCLUDE,
      });

      if (existing?.isLocked) {
        return existing;
      }

      const lock = await tx.timesheetPeriodLock.upsert({
        where: {
          organizationId_periodStart_periodEnd: {
            organizationId,
            periodStart: start,
            periodEnd: end,
          },
        },
        create: {
          organizationId,
          periodStart: start,
          periodEnd: end,
          isLocked: true,
          lockedAt: now,
          lockedByMemberId: member.id,
        },
        update: {
          isLocked: true,
          lockedAt: now,
          lockedByMemberId: member.id,
          unlockedAt: null,
          unlockedByMemberId: null,
          unlockReason: null,
        },
        include: TIMESHEET_PERIOD_LOCK_INCLUDE,
      });

      await tx.timesheetAuditLog.create({
        data: {
          organizationId,
          actorMemberId: member.id,
          action: TimesheetAuditAction.LOCKED_PERIOD,
          before: existing ? toJson(existing) : undefined,
          after: toJson(lock),
        },
      });

      return lock;
    });
  }

  async unlockPeriod(
    organizationId: string,
    userId: string | undefined,
    dto: UnlockTimesheetPeriodDTO,
  ) {
    const member = await this.resolveMember(organizationId, userId);
    this.ensureOwnerMember(member.role);

    const reason = dto.reason.trim();
    if (!reason) {
      throw new BadRequestException('Unlock reason is required.');
    }

    const { start, end } = parsePeriodRange(dto.periodStart, dto.periodEnd);
    const now = new Date();

    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.timesheetPeriodLock.findUnique({
        where: {
          organizationId_periodStart_periodEnd: {
            organizationId,
            periodStart: start,
            periodEnd: end,
          },
        },
        include: TIMESHEET_PERIOD_LOCK_INCLUDE,
      });

      const lock = await tx.timesheetPeriodLock.upsert({
        where: {
          organizationId_periodStart_periodEnd: {
            organizationId,
            periodStart: start,
            periodEnd: end,
          },
        },
        create: {
          organizationId,
          periodStart: start,
          periodEnd: end,
          isLocked: false,
          unlockedAt: now,
          unlockedByMemberId: member.id,
          unlockReason: reason,
        },
        update: {
          isLocked: false,
          unlockedAt: now,
          unlockedByMemberId: member.id,
          unlockReason: reason,
        },
        include: TIMESHEET_PERIOD_LOCK_INCLUDE,
      });

      await tx.timesheetAuditLog.create({
        data: {
          organizationId,
          actorMemberId: member.id,
          action: TimesheetAuditAction.UNLOCKED_PERIOD,
          before: existing ? toJson(existing) : undefined,
          after: toJson(lock),
        },
      });

      return lock;
    });
  }

  async getAuditLogs(
    organizationId: string,
    userId: string | undefined,
    query: GetTimesheetAuditLogsQueryDTO,
  ): Promise<PaginatedResponse<TimesheetAuditLogWithRelations>> {
    const member = await this.resolveMember(organizationId, userId);
    this.ensureAdminMember(member.role);

    const { page, limit } = query;
    const where: Prisma.TimesheetAuditLogWhereInput = {
      organizationId,
      ...(query.action ? { action: query.action } : {}),
      ...(query.targetUserId ? { targetUserId: query.targetUserId } : {}),
      ...(query.timesheetEntryId ? { timesheetEntryId: query.timesheetEntryId } : {}),
    };

    if (query.periodStart || query.periodEnd) {
      if (!query.periodStart || !query.periodEnd) {
        throw new BadRequestException('Both periodStart and periodEnd are required when filtering audit logs by period.');
      }

      const { start, end } = parsePeriodRange(query.periodStart, query.periodEnd);
      const logs = await this.prisma.timesheetAuditLog.findMany({
        where,
        include: TIMESHEET_AUDIT_LOG_INCLUDE,
        orderBy: { createdAt: 'desc' },
      });
      const filtered = logs.filter((log) => auditLogMatchesPeriod(log, start, end));
      const offset = (page - 1) * limit;

      return {
        data: filtered.slice(offset, offset + limit),
        meta: buildPaginationMeta(filtered.length, page, limit),
      };
    }

    const [logs, total] = await Promise.all([
      this.prisma.timesheetAuditLog.findMany({
        where,
        include: TIMESHEET_AUDIT_LOG_INCLUDE,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.timesheetAuditLog.count({ where }),
    ]);

    return { data: logs, meta: buildPaginationMeta(total, page, limit) };
  }

  async getProjects(
    organizationId: string,
    userId: string | undefined,
    query: GetTimesheetProjectsQueryDTO,
  ) {
    await this.resolveMember(organizationId, userId);
    const { page, limit, search } = query;

    const where: Prisma.ProjectWhereInput = {
      organizationId,
      ...(search
        ? {
            OR: [
              { customerName: { contains: search, mode: 'insensitive' } },
              { workOrderNumber: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [projects, total] = await Promise.all([
      this.prisma.project.findMany({
        where,
        select: {
          id:              true,
          customerName:    true,
          workOrderNumber: true,
          status:          true,
          reportedDate:    true,
        },
        skip: (page - 1) * limit,
        take: limit,
        orderBy: [{ customerName: 'asc' }, { workOrderNumber: 'asc' }],
      }),
      this.prisma.project.count({ where }),
    ]);

    return { data: projects, meta: buildPaginationMeta(total, page, limit) };
  }

  private async resolveMember(organizationId: string, userId: string | undefined) {
    if (!userId) {
      throw new ForbiddenException('Authentication is required.');
    }

    const member = await this.prisma.member.findUnique({
      where: { organizationId_userId: { organizationId, userId } },
      select: { id: true, role: true },
    });

    if (!member) {
      throw new ForbiddenException('User is not a member of the active organization.');
    }

    return member;
  }

  private async ensureProjectInOrganization(projectId: string, organizationId: string): Promise<void> {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, organizationId },
      select: { id: true },
    });

    if (!project) {
      throw new NotFoundException('Project not found in this organization.');
    }
  }

  private async ensureDateNotLocked(organizationId: string, workDate: Date): Promise<void> {
    const lock = await this.prisma.timesheetPeriodLock.findFirst({
      where: {
        organizationId,
        isLocked: true,
        periodStart: { lte: workDate },
        periodEnd: { gte: workDate },
      },
      select: { id: true },
    });

    if (lock) {
      throw new ForbiddenException('This timesheet period is locked.');
    }
  }

  private async ensurePeriodNotLocked(organizationId: string, periodStart: Date, periodEnd: Date): Promise<void> {
    const lock = await this.prisma.timesheetPeriodLock.findFirst({
      where: {
        organizationId,
        isLocked: true,
        periodStart: { lte: periodEnd },
        periodEnd: { gte: periodStart },
      },
      select: { id: true },
    });

    if (lock) {
      throw new ForbiddenException('This timesheet period is locked.');
    }
  }

  private async ensureDailyHoursLimit(
    organizationId: string,
    userId: string,
    workDate: Date,
    hours: number,
    isOvertime: boolean,
    excludeEntryId?: string,
  ): Promise<void> {
    const where = {
      organizationId,
      userId,
      workDate,
      ...(excludeEntryId ? { id: { not: excludeEntryId } } : {}),
    };

    const [totalResult, regularResult] = await Promise.all([
      this.prisma.timesheetEntry.aggregate({ where, _sum: { hours: true } }),
      this.prisma.timesheetEntry.aggregate({
        where: { ...where, isOvertime: false },
        _sum: { hours: true },
      }),
    ]);

    const existingTotalHours = totalResult._sum.hours ?? 0;
    if (existingTotalHours + hours > MAX_TOTAL_HOURS_PER_DAY) {
      throw new BadRequestException(`Total timesheet hours cannot exceed ${MAX_TOTAL_HOURS_PER_DAY} hours for one work date.`);
    }

    if (!isOvertime) {
      const existingRegularHours = regularResult._sum.hours ?? 0;
      if (existingRegularHours + hours > MAX_REGULAR_HOURS_PER_DAY) {
        throw new BadRequestException(
          `Regular hours across all projects cannot exceed ${MAX_REGULAR_HOURS_PER_DAY} hours for one work date. Mark the extra hours as overtime.`,
        );
      }
    }
  }

  private async findOwnEntryOrThrow(
    entryId: string,
    organizationId: string,
    userId: string,
  ): Promise<TimesheetEntryWithRelations> {
    const entry = await this.prisma.timesheetEntry.findFirst({
      where: { id: entryId, organizationId, userId },
      include: TIMESHEET_ENTRY_INCLUDE,
    });

    if (!entry) {
      throw new NotFoundException('Timesheet entry not found.');
    }

    return entry;
  }

  private assertCanEdit(status: TimesheetEntryStatus): void {
    // Draft, rejected, and submitted (pending) entries can be edited; approved entries are locked.
    if (status === TimesheetEntryStatus.APPROVED) {
      throw new BadRequestException('Approved timesheet entries can no longer be modified.');
    }
  }

  private assertCanDelete(status: TimesheetEntryStatus): void {
    if (status !== TimesheetEntryStatus.DRAFT && status !== TimesheetEntryStatus.REJECTED) {
      throw new BadRequestException('Only draft or rejected timesheet entries can be deleted.');
    }
  }

  private ensureAdminMember(role: string): void {
    if (!isOrgAdminRole(role)) {
      throw new ForbiddenException('Only organization admins and owners can manage timesheet approvals.');
    }
  }

  private ensureOwnerMember(role: string): void {
    if (role !== 'owner') {
      throw new ForbiddenException('Only organization owners can lock or unlock timesheet periods.');
    }
  }

  private buildSummaryWhere(
    organizationId: string,
    periodStart: Date,
    periodEnd: Date,
    query: GetTimesheetSummaryQueryDTO,
  ): Prisma.TimesheetEntryWhereInput {
    return {
      organizationId,
      workDate: { gte: periodStart, lte: periodEnd },
      ...(query.userId ? { userId: query.userId } : {}),
      ...(query.projectId ? { projectId: query.projectId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.tag ? { project: { workOrderNumber: { contains: query.tag, mode: 'insensitive' } } } : {}),
      ...(query.employee
        ? {
            user: {
              OR: [
                { name: { contains: query.employee, mode: 'insensitive' } },
                { email: { contains: query.employee, mode: 'insensitive' } },
              ],
            },
          }
        : {}),
    };
  }

  private async findApprovalTargetEntries(organizationId: string, entryIds: string[]): Promise<TimesheetSummaryEntry[]> {
    const uniqueIds = [...new Set(entryIds)];
    const entries = await this.prisma.timesheetEntry.findMany({
      where: { organizationId, id: { in: uniqueIds } },
      include: TIMESHEET_SUMMARY_ENTRY_INCLUDE,
      orderBy: [{ workDate: 'asc' }, { createdAt: 'asc' }],
    });

    if (entries.length !== uniqueIds.length) {
      throw new NotFoundException('One or more timesheet entries were not found in this organization.');
    }

    return entries;
  }

  private ensureNoSelfApproval(entries: TimesheetSummaryEntry[], actorUserId: string): void {
    if (entries.some((entry) => entry.userId === actorUserId)) {
      throw new ForbiddenException('Approvers cannot approve or reject their own timesheet entries.');
    }
  }

  private buildWorkDateFilter(periodStart?: string, periodEnd?: string): Prisma.TimesheetEntryWhereInput {
    if (!periodStart && !periodEnd) return {};

    const start = periodStart ? parseDateOnly(periodStart) : undefined;
    const end = periodEnd ? endOfDate(parseDateOnly(periodEnd)) : undefined;

    if (start && end && start > end) {
      throw new BadRequestException('periodStart must be before or equal to periodEnd.');
    }

    return {
      workDate: {
        ...(start ? { gte: start } : {}),
        ...(end ? { lte: end } : {}),
      },
    };
  }
}

function parseDateOnly(value: string): Date {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new BadRequestException('Invalid date value.');
  }

  return new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate()));
}

function parsePeriodRange(periodStart: string, periodEnd: string): { start: Date; end: Date } {
  const start = parseDateOnly(periodStart);
  const end = endOfDate(parseDateOnly(periodEnd));

  if (start > end) {
    throw new BadRequestException('periodStart must be before or equal to periodEnd.');
  }

  return { start, end };
}

function endOfDate(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 23, 59, 59, 999));
}

function normalizeOptionalString(value: string | null | undefined): string | null {
  if (value === undefined || value === null) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function auditLogMatchesPeriod(log: TimesheetAuditLogWithRelations, periodStart: Date, periodEnd: Date): boolean {
  const snapshots = [log.after, log.before];
  return snapshots.some((snapshot) => {
    if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) return false;
    const value = snapshot as Record<string, unknown>;
    return dateValueMatches(value['periodStart'], periodStart) && dateValueMatches(value['periodEnd'], periodEnd);
  });
}

function dateValueMatches(value: unknown, expected: Date): boolean {
  if (typeof value !== 'string' && !(value instanceof Date)) return false;
  const date = new Date(value);
  return !Number.isNaN(date.getTime()) && toDateInputValue(date) === toDateInputValue(expected);
}

function buildTimesheetSummary(
  entries: TimesheetSummaryEntry[],
  periodStart: Date,
  periodEnd: Date,
  isLocked: boolean,
  organizationId: string,
) {
  const employeeMap = new Map<string, {
    userId: string;
    employeeName: string;
    employeeEmail: string;
    employeeCode: string | null;
    department: string;
    totalHours: number;
    regularHours: number;
    overtimeHours: number;
    leaveHours: number;
    offsetHours: number;
    status: string;
    dailyTotals: Record<string, number>;
    projectTotals: Record<string, number>;
    entries: TimesheetSummaryEntry[];
  }>();

  const dayKeys = daysBetween(periodStart, periodEnd).map(toDateInputValue);

  for (const entry of entries) {
    const key = entry.userId;
    const existing = employeeMap.get(key) ?? {
      userId: entry.userId,
      employeeName: entry.user.name || entry.user.email,
      employeeEmail: entry.user.email,
      employeeCode: entry.user.employeeCode ?? null,
      department: employeeTeamNames(entry, organizationId),
      totalHours: 0,
      regularHours: 0,
      overtimeHours: 0,
      leaveHours: 0,
      offsetHours: 0,
      status: 'DRAFT',
      dailyTotals: Object.fromEntries(dayKeys.map((day) => [day, 0])) as Record<string, number>,
      projectTotals: {},
      entries: [],
    };

    existing.totalHours += entry.hours;
    if (entry.isOvertime) existing.overtimeHours += entry.hours;
    if (entry.workType === 'LEAVE') existing.leaveHours += entry.hours;
    if (entry.workType === 'OFFSET') existing.offsetHours += entry.hours;
    if (!entry.isOvertime && entry.workType !== 'LEAVE' && entry.workType !== 'OFFSET') existing.regularHours += entry.hours;

    const dayKey = toDateInputValue(entry.workDate);
    existing.dailyTotals[dayKey] = (existing.dailyTotals[dayKey] ?? 0) + entry.hours;

    const projectKey = `${entry.project.customerName} — ${entry.project.workOrderNumber}`;
    existing.projectTotals[projectKey] = (existing.projectTotals[projectKey] ?? 0) + entry.hours;
    existing.entries.push(entry);
    employeeMap.set(key, existing);
  }

  const employees = [...employeeMap.values()].map((employee) => ({
    ...employee,
    totalHours: roundHours(employee.totalHours),
    regularHours: roundHours(employee.regularHours),
    overtimeHours: roundHours(employee.overtimeHours),
    leaveHours: roundHours(employee.leaveHours),
    offsetHours: roundHours(employee.offsetHours),
    dailyTotals: roundRecord(employee.dailyTotals),
    projectTotals: roundRecord(employee.projectTotals),
    status: rollupStatus(employee.entries.map((entry) => entry.status)),
  }));

  const totalsByStatus = entries.reduce<Record<string, number>>((acc, entry) => {
    acc[entry.status] = (acc[entry.status] ?? 0) + 1;
    return acc;
  }, {});

  return {
    periodStart,
    periodEnd,
    isLocked,
    totalEmployees: employees.length,
    totalEntries: entries.length,
    totalHours: roundHours(entries.reduce((total, entry) => total + entry.hours, 0)),
    totalsByStatus,
    employees,
  };
}

async function buildTimesheetWorkbook(options: {
  entries: TimesheetSummaryEntry[];
  periodStart: Date;
  periodEnd: Date;
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
  exportedBy: string;
  exportedAt: Date;
  isLocked: boolean;
}): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Meedo';
  workbook.created = options.exportedAt;
  workbook.modified = options.exportedAt;

  const summary = buildTimesheetSummary(
    options.entries,
    options.periodStart,
    options.periodEnd,
    options.isLocked,
    options.organizationId,
  );

  addSummarySheet(workbook, options, summary);
  addDetailsSheet(workbook, options.entries, options.organizationId);
  addProjectTotalsSheet(workbook, options.entries);

  return workbook;
}

const PAYROLL_HEADERS = ['Team', 'Employee', 'Code', 'RG', 'OT', 'RD', 'RH', 'SH', 'RHRD', 'SHRD', 'LVE', 'ND', 'Hours', 'Status'];
const PAYROLL_STATUS_COLUMN = 14;
const PAYROLL_NUMERIC_COLUMNS = [4, 5, 6, 7, 8, 9, 10, 11, 12, 13];
const PAYROLL_HEADER_ROW = 6;
const COMPANY_TIMEZONE = 'Asia/Manila';

function addSummarySheet(
  workbook: ExcelJS.Workbook,
  options: {
    periodStart: Date;
    periodEnd: Date;
    organizationName: string;
    exportedBy: string;
    exportedAt: Date;
    isLocked: boolean;
  },
  summary: ReturnType<typeof buildTimesheetSummary>,
): void {
  const sheet = workbook.addWorksheet('Timesheet', { views: [{ state: 'frozen', ySplit: PAYROLL_HEADER_ROW }] });

  sheet.mergeCells('A1:N1');
  sheet.getCell('A1').value = `Timesheet — ${formatLongDate(options.periodStart)} to ${formatLongDate(options.periodEnd)}`;
  sheet.getCell('A1').font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } };
  sheet.getCell('A1').fill = solidFill('1F4E78');
  sheet.getCell('A1').alignment = { vertical: 'middle', horizontal: 'center' };
  sheet.getRow(1).height = 24;

  const metadata: [string, string][] = [
    ['Organization', options.organizationName],
    ['Exported by', options.exportedBy],
    ['Export date', formatLongDate(options.exportedAt, COMPANY_TIMEZONE)],
  ];
  metadata.forEach(([label, value], index) => {
    const row = sheet.getRow(index + 2);
    row.getCell(1).value = label;
    row.getCell(1).font = { bold: true };
    row.getCell(2).value = value;
  });

  sheet.getRow(PAYROLL_HEADER_ROW).values = PAYROLL_HEADERS;
  styleHeaderRow(sheet.getRow(PAYROLL_HEADER_ROW));

  summary.employees.forEach((employee, index) => {
    const buckets = payrollBuckets(employee.entries);

    const status = options.isLocked ? 'LOCKED' : employee.status;
    const row = sheet.getRow(PAYROLL_HEADER_ROW + 1 + index);
    row.values = [
      employee.department || '—',
      employee.employeeName,
      employee.employeeCode ?? '',
      buckets.rg, buckets.ot, buckets.rd, buckets.rh, buckets.sh,
      buckets.rhrd, buckets.shrd, buckets.lve, buckets.nd, buckets.hours,
      status,
    ];
    applyStatusFill(row.getCell(PAYROLL_STATUS_COLUMN), status);
    PAYROLL_NUMERIC_COLUMNS.forEach((cell) => { row.getCell(cell).numFmt = 'General'; });
  });

  sheet.columns = [
    { width: 12 },
    { width: 28 },
    { width: 22 },
    { width: 8 }, { width: 8 }, { width: 8 }, { width: 8 }, { width: 8 },
    { width: 9 }, { width: 9 }, { width: 8 }, { width: 8 }, { width: 10 },
    { width: 12 },
  ];
}

/** "July 6, 2026". Period dates are UTC date-only values, so format them in UTC;
 *  pass the company timezone for real timestamps like the export date. */
function formatLongDate(date: Date, timeZone = 'UTC'): string {
  return new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone }).format(date);
}

interface PayrollBuckets {
  rg: number; ot: number; rd: number; rh: number; sh: number;
  rhrd: number; shrd: number; lve: number; nd: number; hours: number;
}

function emptyPayrollBuckets(): PayrollBuckets {
  return { rg: 0, ot: 0, rd: 0, rh: 0, sh: 0, rhrd: 0, shrd: 0, lve: 0, nd: 0, hours: 0 };
}

/** Assigns each entry's hours to exactly one payroll bucket. RH/SH/RHRD/SHRD are not
 *  yet distinguishable in the data model, so they stay 0. */
function payrollBuckets(entries: TimesheetSummaryEntry[]): PayrollBuckets {
  const buckets = emptyPayrollBuckets();
  for (const entry of entries) {
    buckets.hours += entry.hours;
    if (entry.isOvertime) buckets.ot += entry.hours;
    else if (entry.isNightDifferential) buckets.nd += entry.hours;
    else if (entry.workType === 'LEAVE') buckets.lve += entry.hours;
    else if (entry.workType === 'REST_DAY') buckets.rd += entry.hours;
    else buckets.rg += entry.hours;
  }
  return {
    rg: roundHours(buckets.rg), ot: roundHours(buckets.ot), rd: roundHours(buckets.rd),
    rh: buckets.rh, sh: buckets.sh, rhrd: buckets.rhrd, shrd: buckets.shrd,
    lve: roundHours(buckets.lve), nd: roundHours(buckets.nd), hours: roundHours(buckets.hours),
  };
}

function addDetailsSheet(workbook: ExcelJS.Workbook, entries: TimesheetSummaryEntry[], organizationId: string): void {
  const sheet = workbook.addWorksheet('Timesheet Details', { views: [{ state: 'frozen', ySplit: 3 }] });
  sheet.mergeCells('A1:Q1');
  sheet.getCell('A1').value = 'Timesheet Details';
  sheet.getCell('A1').font = { bold: true, size: 16, color: { argb: 'FFFFFFFF' } };
  sheet.getCell('A1').fill = solidFill('1F4E78');
  sheet.getCell('A1').alignment = { vertical: 'middle', horizontal: 'center' };

  const headers = [
    'Approved flag',
    'Approved by',
    'OT',
    'ND',
    'Work date',
    'Location',
    'Project',
    'Tag/work order',
    'Task',
    'Actual hours',
    'Project description',
    'Week number',
    'Status',
    'Employee name',
    'Employee email',
    'Department/team',
    'Approved at',
  ];
  sheet.getRow(3).values = headers;
  styleHeaderRow(sheet.getRow(3));

  entries.forEach((entry, index) => {
    const row = sheet.getRow(index + 4);
    row.values = [
      entry.status === TimesheetEntryStatus.APPROVED ? '✓' : '',
      entry.approvedBy?.user.name || entry.approvedBy?.user.email || '',
      entry.isOvertime ? 'Y' : '',
      entry.isNightDifferential ? 'Y' : '',
      toDateInputValue(entry.workDate),
      entry.location,
      entry.project.customerName,
      entry.project.workOrderNumber,
      entry.task,
      entry.hours,
      entry.projectDescription ?? '',
      weekNumber(entry.workDate),
      entry.status,
      entry.user.name || entry.user.email,
      entry.user.email,
      employeeTeamNames(entry, organizationId),
      entry.approvedAt ? toDateInputValue(entry.approvedAt) : '',
    ];
    row.getCell(10).numFmt = '0.00';
    row.getCell(9).alignment = { wrapText: true, vertical: 'top' };
    row.getCell(11).alignment = { wrapText: true, vertical: 'top' };
    applyStatusFill(row.getCell(13), entry.status);
  });

  const totalRow = sheet.getRow(entries.length + 5);
  totalRow.values = ['', '', '', '', '', '', '', '', 'Total', entries.reduce((total, entry) => total + entry.hours, 0)];
  totalRow.font = { bold: true };
  totalRow.getCell(10).numFmt = '0.00';

  sheet.autoFilter = {
    from: { row: 3, column: 1 },
    to: { row: Math.max(4, entries.length + 3), column: headers.length },
  };

  sheet.columns = [
    { width: 14 },
    { width: 24 },
    { width: 8 },
    { width: 8 },
    { width: 14 },
    { width: 14 },
    { width: 28 },
    { width: 18 },
    { width: 42 },
    { width: 14 },
    { width: 34 },
    { width: 12 },
    { width: 14 },
    { width: 26 },
    { width: 34 },
    { width: 22 },
    { width: 14 },
  ];
}

function addProjectTotalsSheet(workbook: ExcelJS.Workbook, entries: TimesheetSummaryEntry[]): void {
  const sheet = workbook.addWorksheet('Project Totals', { views: [{ state: 'frozen', ySplit: 1 }] });
  sheet.getRow(1).values = ['Project', 'Tag/work order', 'Total hours'];
  styleHeaderRow(sheet.getRow(1));

  const totals = new Map<string, { project: string; tag: string; hours: number }>();
  for (const entry of entries) {
    const key = `${entry.project.id}:${entry.project.workOrderNumber}`;
    const existing = totals.get(key) ?? { project: entry.project.customerName, tag: entry.project.workOrderNumber, hours: 0 };
    existing.hours += entry.hours;
    totals.set(key, existing);
  }

  [...totals.values()].forEach((total, index) => {
    const row = sheet.getRow(index + 2);
    row.values = [total.project, total.tag, total.hours];
    row.getCell(3).numFmt = '0.00';
  });

  const totalRow = sheet.getRow(totals.size + 3);
  totalRow.values = ['Grand total', '', entries.reduce((sum, entry) => sum + entry.hours, 0)];
  totalRow.font = { bold: true };
  totalRow.getCell(3).numFmt = '0.00';

  sheet.columns = [{ width: 34 }, { width: 20 }, { width: 14 }];
}

function styleHeaderRow(row: ExcelJS.Row): void {
  // Style only the populated header cells; a row-level fill would bleed to the sheet edge.
  row.eachCell({ includeEmpty: false }, (cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = solidFill('4472C4');
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  });
}

function solidFill(argb: string): ExcelJS.Fill {
  return { type: 'pattern', pattern: 'solid', fgColor: { argb } };
}

function applyStatusFill(cell: ExcelJS.Cell, status: string): void {
  const color = status === 'APPROVED'
    ? 'C6EFCE'
    : status === 'SUBMITTED' || status === 'PENDING'
      ? 'FFEB9C'
      : status === 'REJECTED'
        ? 'FFC7CE'
        : 'E7E6E6';
  cell.fill = solidFill(color);
  cell.font = { bold: true, color: { argb: 'FF000000' } };
}

function rollupStatus(statuses: TimesheetEntryStatus[]): string {
  if (statuses.length === 0) return 'DRAFT';
  if (statuses.some((status) => status === TimesheetEntryStatus.REJECTED)) return 'REJECTED';
  if (statuses.some((status) => status === TimesheetEntryStatus.SUBMITTED)) return 'PENDING';
  if (statuses.every((status) => status === TimesheetEntryStatus.APPROVED)) return 'APPROVED';
  return 'DRAFT';
}

function employeeTeamNames(entry: TimesheetSummaryEntry, organizationId: string): string {
  const names = entry.user.teamMembers
    .map((teamMember) => teamMember.team)
    .filter((team) => !organizationId || team.organizationId === organizationId)
    .map((team) => team.name);

  return names.length > 0 ? [...new Set(names)].join(', ') : '—';
}

function daysBetween(start: Date, end: Date): Date[] {
  const days: Date[] = [];
  const current = parseDateOnly(toDateInputValue(start));
  const last = parseDateOnly(toDateInputValue(end));
  while (current <= last) {
    days.push(new Date(current));
    current.setUTCDate(current.getUTCDate() + 1);
  }
  return days;
}

function roundHours(value: number): number {
  return Math.round(value * 100) / 100;
}

function roundRecord(record: Record<string, number>): Record<string, number> {
  return Object.fromEntries(Object.entries(record).map(([key, value]) => [key, roundHours(value)]));
}

function weekNumber(date: Date): number {
  const target = parseDateOnly(toDateInputValue(date));
  const dayNumber = target.getUTCDay() || 7;
  target.setUTCDate(target.getUTCDate() + 4 - dayNumber);
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
  return Math.ceil((((target.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

function toDateInputValue(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function sanitizeFilename(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '') || 'organization';
}
