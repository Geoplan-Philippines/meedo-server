import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { TicketStatus } from '@prisma/client';

import { PrismaService } from '../../../core/database/prisma.service';
import { LEGACY_STATUS_NAME_MAP, SYSTEM_STATUSES } from '../../../common/constants/statuses.constants';
import { CreateStatusDTO } from './dto/create-status.dto';
import { UpdateStatusDTO } from './dto/update-status.dto';


@Injectable()
export class StatusesService {
  constructor(private prisma: PrismaService) {}

  async getStatusesByOrganization(organizationId: string): Promise<TicketStatus[]> {
    // Self-heal: make sure the built-in system statuses exist for this org
    // (covers organizations created before the standard set was introduced).
    await this.ensureSystemStatuses(organizationId);
    // Order custom statuses by createdAt here; sortByCanonicalOrder relies on a
    // stable sort to preserve it (system/custom partitioning is handled there, so
    // no isSystem hint is needed).
    const statuses = await this.prisma.ticketStatus.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'asc' },
    });
    return this.sortByCanonicalOrder(statuses);
  }

  /**
   * System statuses display in their canonical SYSTEM_STATUSES order rather than
   * creation order — a self-healed status (e.g. "In Review", added after the
   * original set) must slot into its defined position, not append to the end.
   * Custom statuses keep their createdAt order and follow the system set.
   */
  private sortByCanonicalOrder(statuses: TicketStatus[]): TicketStatus[] {
    const rank = new Map<string, number>(
      SYSTEM_STATUSES.map((status, index) => [status.name, index]),
    );
    const rankOf = (status: TicketStatus): number =>
      status.isSystem ? rank.get(status.name) ?? Number.MAX_SAFE_INTEGER : Number.MAX_SAFE_INTEGER;
    return [...statuses].sort((a, b) => rankOf(a) - rankOf(b));
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

  /** Standard/built-in statuses are locked — reject any attempt to modify them. */
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
      // promotes the existing row in place — preserving its id and every ticket
      // pointing at it — instead of creating a duplicate (e.g. the pre-existing
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
      // renamed legacy default), only flag it as a system status — never
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
