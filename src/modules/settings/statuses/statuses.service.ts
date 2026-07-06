import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { TicketStatus } from '@prisma/client';

import { PrismaService } from '../../../core/database/prisma.service';
import { SYSTEM_STATUSES } from '../../../common/constants/statuses.constants';
import { CreateStatusDTO } from './dto/create-status.dto';
import { UpdateStatusDTO } from './dto/update-status.dto';


@Injectable()
export class StatusesService {
  constructor(private prisma: PrismaService) {}

  async getStatusesByOrganization(organizationId: string): Promise<TicketStatus[]> {
    // Self-heal: make sure the built-in system statuses exist for this org
    // (covers organizations created before the standard set was introduced).
    await this.ensureSystemStatuses(organizationId);
    const statuses = await this.prisma.ticketStatus.findMany({
      where: { organizationId },
      orderBy: [{ isSystem: 'desc' }, { createdAt: 'asc' }],
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
    // Upsert by (organizationId, name): create missing ones and promote any
    // same-named legacy status to the canonical system definition.
    await this.prisma.$transaction(
      SYSTEM_STATUSES.map((status) =>
        this.prisma.ticketStatus.upsert({
          where: { organizationId_name: { organizationId, name: status.name } },
          update: { isSystem: true, color: status.color, category: status.category },
          create: {
            organizationId,
            name: status.name,
            color: status.color,
            category: status.category,
            isSystem: true,
          },
        }),
      ),
    );
  }
}
