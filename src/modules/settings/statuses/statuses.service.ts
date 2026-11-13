import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, TicketStatus } from '@prisma/client';

import { PrismaService } from '../../../core/database/prisma.service';
import { LEGACY_STATUS_NAME_MAP, SYSTEM_STATUSES } from '../../../common/constants/statuses.constants';
import { PaginatedResponse } from '../../../common/responses/paginated-api.response';
import {
  containsInsensitive,
  escapeLikePattern,
  orderByIds,
  sqlDirection,
  toPage,
} from '../../../common/utils/pagination.util';
import { CreateStatusDTO } from './dto/create-status.dto';
import { GetStatusesQueryDTO } from './dto/get-statuses-query.dto';
import { UpdateStatusDTO } from './dto/update-status.dto';

/** Sort rank for custom statuses and unknown system names: after every canonical status. */
const UNRANKED = 2147483647;


@Injectable()
export class StatusesService {
  constructor(private prisma: PrismaService) {}

  async getStatusesByOrganization(query: GetStatusesQueryDTO, organizationId: string): Promise<PaginatedResponse<TicketStatus>> {
    // Self-heal: make sure the built-in system statuses exist for this org
    // (covers organizations created before the standard set was introduced).
    await this.ensureSystemStatuses(organizationId);
    const where: Prisma.TicketStatusWhereInput = {
      organizationId,
      ...(query.isSystem === undefined ? {} : { isSystem: query.isSystem }),
      ...(query.includeArchived === false ? { isArchived: false } : {}),
      ...(query.search ? { name: containsInsensitive(query.search) } : {}),
    };
    const [ids, total] = await Promise.all([this.pageStatusIds(query, organizationId), this.prisma.ticketStatus.count({ where })]);
    const statuses = ids.length ? await this.prisma.ticketStatus.findMany({ where: { id: { in: ids } } }) : [];
    return toPage(orderByIds(statuses, ids), total, query);
  }

  /**
   * One page of status ids. By default (`position`) system statuses come first
   * in their canonical SYSTEM_STATUSES order rather than creation order, so a
   * self-healed status (e.g. "In Review", added after the original set) slots
   * into its defined position. Custom statuses follow, oldest first. Filters
   * match the `where` in getStatusesByOrganization.
   */
  private async pageStatusIds(query: GetStatusesQueryDTO, organizationId: string): Promise<string[]> {
    const pattern = query.search ? `%${escapeLikePattern(query.search)}%` : null;
    const field = query.sortField ?? 'position';
    const direction = sqlDirection(query.sortOrder);
    const systemNames = SYSTEM_STATUSES.map((status) => status.name);
    const orderBy =
      field === 'name'
        ? Prisma.sql`LOWER(s.name) ${direction}`
        : field === 'createdAt'
          ? Prisma.sql`s.created_at ${direction}`
          : Prisma.sql`CASE WHEN s.is_system THEN COALESCE(array_position(${systemNames}::text[], s.name), ${UNRANKED}) ELSE ${UNRANKED} END ${direction}, s.created_at ${direction}`;
    const rows = await this.prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
      SELECT s.id
      FROM ticket_status s
      WHERE s.organization_id = ${organizationId}
        AND (${query.isSystem ?? null}::boolean IS NULL OR s.is_system = ${query.isSystem ?? null}::boolean)
        AND (${query.includeArchived !== false} OR s.is_archived = false)
        AND (${pattern}::text IS NULL OR s.name ILIKE ${pattern})
      ORDER BY ${orderBy}, s.id
      LIMIT ${query.limit} OFFSET ${(query.page - 1) * query.limit}
    `);
    return rows.map((row) => row.id);
  }

  async createStatus(data: CreateStatusDTO, organizationId: string): Promise<TicketStatus> {
    return this.prisma.ticketStatus.create({
      data: {
        name: data.name,
        color: data.color,
        // Omitted category falls back to the schema default (BACKLOG).
        category: data.category,
        organization: {
          connect: { id: organizationId },
        },
      },
    });
  }

  async updateStatus(id: string, data: UpdateStatusDTO, organizationId: string): Promise<TicketStatus> {
    await this.assertNotSystem(id, organizationId);
    return this.prisma.ticketStatus.update({
      where: { id, organizationId },
      data,
    });
  }

  async archiveStatus(id: string, organizationId: string): Promise<TicketStatus> {
    await this.assertNotSystem(id, organizationId);
    return this.prisma.ticketStatus.update({
      where: { id, organizationId },
      data: { isArchived: true },
    });
  }

  async restoreStatus(id: string, organizationId: string): Promise<TicketStatus> {
    await this.assertNotSystem(id, organizationId);
    return this.prisma.ticketStatus.update({
      where: { id, organizationId },
      data: { isArchived: false },
    });
  }

  /** Standard and built-in statuses are locked. Reject any attempt to modify them. */
  private async assertNotSystem(id: string, organizationId: string): Promise<void> {
    const status = await this.prisma.ticketStatus.findFirst({
      where: { id, organizationId },
      select: { isSystem: true },
    });
    if (!status) {
      throw new NotFoundException('Status not found in this organization.');
    }
    if (status.isSystem) {
      throw new BadRequestException("Standard statuses can't be edited, archived, or deleted.");
    }
  }

  /** Idempotently seed the built-in system statuses for an organization. */
  private async ensureSystemStatuses(organizationId: string): Promise<void> {
    const existing = await this.prisma.ticketStatus.count({
      where: { organizationId, isSystem: true },
    });
    if (existing >= SYSTEM_STATUSES.length) {
      return;
    }
    await this.prisma.$transaction(async (tx) => {
      // Rename legacy statuses to their canonical names first so the upsert below
      // promotes the existing row in place, preserving its id and every ticket
      // pointing at it, instead of creating a duplicate (e.g. the pre-existing
      // 'Cancelled' alongside a new 'Canceled', or 'Open' alongside 'Todo'). Skip
      // when the canonical name already exists to avoid violating the
      // (organizationId, name) unique constraint.
      for (const [legacyName, canonicalName] of Object.entries(LEGACY_STATUS_NAME_MAP)) {
        const canonicalExists = await tx.ticketStatus.findUnique({
          where: { organizationId_name: { organizationId, name: canonicalName } },
          select: { id: true },
        });
        if (canonicalExists) {
          continue;
        }
        await tx.ticketStatus.updateMany({
          where: { organizationId, name: legacyName },
          data: { name: canonicalName },
        });
      }

      // Create any missing system statuses. For an already-existing row (e.g. a
      // renamed legacy default), only flag it as a system status. Never
      // overwrite its color or category, which would silently change how existing
      // boards look.
      for (const status of SYSTEM_STATUSES) {
        await tx.ticketStatus.upsert({
          where: { organizationId_name: { organizationId, name: status.name } },
          update: { isSystem: true },
          create: {
            organizationId,
            name: status.name,
            color: status.color,
            category: status.category,
            isSystem: true,
          },
        });
      }
    });
  }
}
