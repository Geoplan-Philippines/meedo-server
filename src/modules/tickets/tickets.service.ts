import { BadRequestException, Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { Prisma, TicketActivityType, TicketPriority } from '@prisma/client';
import { randomInt } from 'node:crypto';

import { PrismaService } from '../../core/database/prisma.service';
import { PaginatedResponse, buildPaginationMeta } from 'src/common/responses/paginated-api.response';
import { CreateTicketDTO } from './dto/create-ticket.dto';
import { UpdateTicketDTO } from './dto/update-ticket.dto';
import { GetAllTicketsQueryDTO } from './dto/get-all-tickets-query.dto';
import { GetTicketFacetsQueryDTO } from './dto/get-ticket-facets-query.dto';
import { TicketActivityService } from './activity/ticket-activity.service';
import {
  MAX_TICKET_NUMBER_RETRIES,
  TICKET_DETAIL_INCLUDE,
  TICKET_INCLUDE,
  TICKET_NUMBER_MAX,
  TICKET_NUMBER_MIN,
  TICKET_SORTABLE_FIELDS,
  TICKET_VIEW_CATEGORIES,
  TicketDetail,
  TicketFacets,
  TicketSortField,
  TicketStats,
  TicketView,
  TicketWithRelations,
  serializeTicketDetail,
} from './constants/ticket.constants';

@Injectable()
export class TicketsService {
  constructor(
    private prisma: PrismaService,
    private activity: TicketActivityService,
  ) {}

  async getAllTickets(
    query: GetAllTicketsQueryDTO,
    organizationId: string,
  ): Promise<PaginatedResponse<TicketWithRelations>> {
    const { page, limit, ticketStatusId, priority, teamId, categoryId, assigneeId, search, includeArchived, view } = query;

    const orderBy = this.buildOrderBy(query.sortField, query.sortOrder);

    const where: Prisma.TicketsWhereInput = {
      organizationId,
      ...(includeArchived ? {} : { isArchived: false }),
      ...this.buildViewWhere(view),
      ...(ticketStatusId?.length ? { ticketStatusId: { in: ticketStatusId } } : {}),
      ...(priority?.length ? { priority: { in: priority } } : {}),
      ...(teamId?.length ? { teamId: { in: teamId } } : {}),
      ...(categoryId ? { categoryId } : {}),
      ...(assigneeId ? { assignees: { some: { memberId: assigneeId } } } : {}),
      ...this.buildSearchWhere(search),
    };

    const [tickets, total] = await Promise.all([
      this.prisma.tickets.findMany({
        where,
        include: TICKET_INCLUDE,
        skip: (page - 1) * limit,
        take: limit,
        orderBy,
      }),
      this.prisma.tickets.count({ where }),
    ]);

    return { data: tickets, meta: buildPaginationMeta(total, page, limit) };
  }

  async getTicketById(id: string, organizationId: string): Promise<TicketDetail> {
    const ticket = await this.prisma.tickets.findFirst({
      where: { id, organizationId },
      include: TICKET_DETAIL_INCLUDE,
    });
    if (!ticket) {
      throw new NotFoundException('Ticket not found in this organization.');
    }
    return serializeTicketDetail(ticket);
  }

  async getTicketStats(organizationId: string): Promise<TicketStats> {
    const baseWhere: Prisma.TicketsWhereInput = { organizationId, isArchived: false };

    const [total, urgent, high, overdue] = await Promise.all([
      this.prisma.tickets.count({ where: baseWhere }),
      this.prisma.tickets.count({ where: { ...baseWhere, priority: TicketPriority.URGENT } }),
      this.prisma.tickets.count({ where: { ...baseWhere, priority: TicketPriority.HIGH } }),
      this.prisma.tickets.count({
        where: { ...baseWhere, resolvedAt: null, dueDate: { lt: new Date() } },
      }),
    ]);

    return { total, urgent, high, overdue };
  }

  async getFacets(query: GetTicketFacetsQueryDTO, organizationId: string): Promise<TicketFacets> {
    const { search, includeArchived, view } = query;

    // Context shared by every count: org + archived scope + the active search.
    const contextWhere: Prisma.TicketsWhereInput = {
      organizationId,
      ...(includeArchived ? {} : { isArchived: false }),
      ...this.buildSearchWhere(search),
    };

    // Status/priority badges reflect the current view, so they match the list.
    const viewWhere: Prisma.TicketsWhereInput = { ...contextWhere, ...this.buildViewWhere(view) };

    const [backlog, active, closed, all, statusGroups, priorityGroups] = await Promise.all([
      this.prisma.tickets.count({ where: { ...contextWhere, ...this.buildViewWhere('backlog') } }),
      this.prisma.tickets.count({ where: { ...contextWhere, ...this.buildViewWhere('active') } }),
      this.prisma.tickets.count({ where: { ...contextWhere, ...this.buildViewWhere('closed') } }),
      this.prisma.tickets.count({ where: contextWhere }),
      this.prisma.tickets.groupBy({ by: ['ticketStatusId'], where: viewWhere, _count: { _all: true } }),
      this.prisma.tickets.groupBy({ by: ['priority'], where: viewWhere, _count: { _all: true } }),
    ]);

    return {
      views: { backlog, active, closed, all },
      statuses: statusGroups
        .filter((group): group is typeof group & { ticketStatusId: string } => group.ticketStatusId !== null)
        .map((group) => ({ ticketStatusId: group.ticketStatusId, count: group._count._all })),
      priorities: priorityGroups.map((group) => ({ priority: group.priority, count: group._count._all })),
    };
  }

  async createTicket(
    data: CreateTicketDTO,
    organizationId: string,
    userId?: string,
  ): Promise<TicketWithRelations> {
    this.assertDueDateNotPast(data.dueDate);
    await this.validateReferences(data, organizationId);

    const uniqueAssigneeIds = data.assigneeIds ? [...new Set(data.assigneeIds)] : [];
    const actorMemberId = await this.activity.resolveMemberId(organizationId, userId);

    let ticket: TicketWithRelations | null = null;
    for (let attempt = 0; attempt < MAX_TICKET_NUMBER_RETRIES; attempt++) {
      try {
        // Create the ticket and its CREATED activity atomically so the audit
        // trail can never start without the opening event (and a failed activity
        // insert rolls back the orphan ticket instead of leaving it behind).
        ticket = await this.prisma.$transaction(async (tx) => {
          const created = await tx.tickets.create({
            data: {
              ticketNumber: this.generateTicketNumber(),
              title: data.title,
              description: data.description,
              priority: data.priority,
              dueDate: data.dueDate,
              organization: { connect: { id: organizationId } },
              ticketStatus: data.ticketStatusId ? { connect: { id: data.ticketStatusId } } : undefined,
              category: data.categoryId ? { connect: { id: data.categoryId } } : undefined,
              project: data.projectId ? { connect: { id: data.projectId } } : undefined,
              team: data.teamId ? { connect: { id: data.teamId } } : undefined,
              assignees: uniqueAssigneeIds.length
                ? { createMany: { data: uniqueAssigneeIds.map((memberId) => ({ memberId })) } }
                : undefined,
            },
            include: TICKET_INCLUDE,
          });

          await this.activity.record(tx, {
            ticketId: created.id,
            actorMemberId,
            type: TicketActivityType.CREATED,
          });

          return created;
        });
        break;
      } catch (error) {
        if (this.isTicketNumberCollision(error)) {
          continue;
        }
        throw error;
      }
    }

    if (!ticket) {
      throw new InternalServerErrorException(
        'Failed to generate a unique ticket number. Please try again.',
      );
    }

    return ticket;
  }

  async updateTicket(
    id: string,
    data: UpdateTicketDTO,
    organizationId: string,
    userId?: string,
  ): Promise<TicketDetail> {
    const existing = await this.prisma.tickets.findFirst({
      where: { id, organizationId },
      select: {
        id: true,
        ticketStatusId: true,
        priority: true,
        dueDate: true,
        assignees: { select: { memberId: true } },
      },
    });
    if (!existing) {
      throw new NotFoundException('Ticket not found in this organization.');
    }

    this.assertDueDateNotPastOnChange(data.dueDate, existing.dueDate);
    await this.validateReferences(data, organizationId);

    const { assigneeIds, relatedTicketIds, ...ticketData } = data;
    if (relatedTicketIds !== undefined) {
      await this.validateRelatedTickets(id, relatedTicketIds, organizationId);
    }

    const actorMemberId = await this.activity.resolveMemberId(organizationId, userId);

    return this.prisma.$transaction(async (tx) => {
      await tx.tickets.update({
        where: { id, organizationId },
        data: ticketData,
      });

      if (assigneeIds !== undefined) {
        await tx.ticketAssignee.deleteMany({ where: { ticketId: id } });

        const uniqueIds = [...new Set(assigneeIds)];
        if (uniqueIds.length > 0) {
          await tx.ticketAssignee.createMany({
            data: uniqueIds.map((memberId) => ({ ticketId: id, memberId })),
          });
        }
      }

      if (relatedTicketIds !== undefined) {
        await this.syncTicketRelations(tx, id, relatedTicketIds);
      }

      await this.recordUpdateActivities(tx, id, actorMemberId, existing, data, assigneeIds);

      const updated = await tx.tickets.findUniqueOrThrow({
        where: { id },
        include: TICKET_DETAIL_INCLUDE,
      });
      return serializeTicketDetail(updated);
    });
  }

  /** Reconcile a ticket's links to exactly `relatedTicketIds`, keeping the mirror
   *  row on each partner in sync so relations stay symmetric on both sides. */
  private async syncTicketRelations(
    tx: Prisma.TransactionClient,
    ticketId: string,
    relatedTicketIds: string[],
  ): Promise<void> {
    const desired = new Set([...new Set(relatedTicketIds)].filter((relatedId) => relatedId !== ticketId));

    const current = await tx.ticketRelation.findMany({
      where: { ticketId },
      select: { relatedTicketId: true },
    });
    const currentIds = new Set(current.map((relation) => relation.relatedTicketId));

    const toRemove = [...currentIds].filter((relatedId) => !desired.has(relatedId));
    const toAdd = [...desired].filter((relatedId) => !currentIds.has(relatedId));

    if (toRemove.length > 0) {
      // Drop both directions of each removed pair.
      await tx.ticketRelation.deleteMany({
        where: {
          OR: [
            { ticketId, relatedTicketId: { in: toRemove } },
            { relatedTicketId: ticketId, ticketId: { in: toRemove } },
          ],
        },
      });
    }

    if (toAdd.length > 0) {
      await tx.ticketRelation.createMany({
        data: toAdd.flatMap((relatedId) => [
          { ticketId, relatedTicketId: relatedId },
          { ticketId: relatedId, relatedTicketId: ticketId },
        ]),
        skipDuplicates: true,
      });
    }
  }

  private async recordUpdateActivities(
    tx: Prisma.TransactionClient,
    ticketId: string,
    actorMemberId: string | null,
    existing: { ticketStatusId: string | null; priority: TicketPriority; assignees: { memberId: string }[] },
    data: UpdateTicketDTO,
    assigneeIds: string[] | undefined,
  ): Promise<void> {
    if (data.ticketStatusId !== undefined && data.ticketStatusId !== existing.ticketStatusId) {
      await this.activity.record(tx, {
        ticketId,
        actorMemberId,
        type: TicketActivityType.STATUS_CHANGED,
        meta: { from: existing.ticketStatusId, to: data.ticketStatusId },
      });
    }

    if (data.priority !== undefined && data.priority !== existing.priority) {
      await this.activity.record(tx, {
        ticketId,
        actorMemberId,
        type: TicketActivityType.PRIORITY_CHANGED,
        meta: { from: existing.priority, to: data.priority },
      });
    }

    if (assigneeIds !== undefined) {
      const before = [...new Set(existing.assignees.map((a) => a.memberId))].sort();
      const after = [...new Set(assigneeIds)].sort();
      if (before.join(',') !== after.join(',')) {
        await this.activity.record(tx, {
          ticketId,
          actorMemberId,
          type: TicketActivityType.ASSIGNEE_CHANGED,
          meta: { from: before, to: after },
        });
      }
    }
  }

  private async validateReferences(
    data: Partial<CreateTicketDTO>,
    organizationId: string,
  ): Promise<void> {
    if (data.ticketStatusId) {
      const status = await this.prisma.ticketStatus.findFirst({
        where: { id: data.ticketStatusId, organizationId },
        select: { id: true },
      });
      if (!status) {
        throw new NotFoundException('Ticket status not found in this organization.');
      }
    }

    if (data.categoryId) {
      const category = await this.prisma.ticketCategory.findFirst({
        where: { id: data.categoryId, organizationId },
        select: { id: true },
      });
      if (!category) {
        throw new NotFoundException('Ticket category not found in this organization.');
      }
    }

    if (data.teamId) {
      const team = await this.prisma.team.findFirst({
        where: { id: data.teamId, organizationId },
        select: { id: true },
      });
      if (!team) {
        throw new NotFoundException('Team not found in this organization.');
      }
    }

    if (data.assigneeIds?.length) {
      const uniqueIds = [...new Set(data.assigneeIds)];
      const count = await this.prisma.member.count({
        where: { id: { in: uniqueIds }, organizationId },
      });
      if (count !== uniqueIds.length) {
        throw new NotFoundException('One or more assignees not found in this organization.');
      }
    }

    if (data.projectId) {
      const project = await this.prisma.project.findFirst({
        where: { id: data.projectId, organizationId },
        select: { id: true },
      });
      if (!project) {
        throw new NotFoundException('Project not found in this organization.');
      }
    }
  }

  private async validateRelatedTickets(
    ticketId: string,
    relatedTicketIds: string[],
    organizationId: string,
  ): Promise<void> {
    const uniqueIds = [...new Set(relatedTicketIds)];
    if (uniqueIds.includes(ticketId)) {
      throw new BadRequestException('A ticket cannot be related to itself.');
    }
    if (uniqueIds.length === 0) {
      return;
    }
    const count = await this.prisma.tickets.count({
      where: { id: { in: uniqueIds }, organizationId },
    });
    if (count !== uniqueIds.length) {
      throw new NotFoundException('One or more related tickets not found in this organization.');
    }
  }

  /** Restrict to the statuses a board view covers; `all`/undefined adds nothing.
   *  Tickets without a status never match a view filter (only "All" shows them). */
  private buildViewWhere(view: TicketView | undefined): Prisma.TicketsWhereInput {
    if (!view || view === 'all') {
      return {};
    }
    return { ticketStatus: { is: { category: { in: TICKET_VIEW_CATEGORIES[view] } } } };
  }

  private buildSearchWhere(search: string | undefined): Prisma.TicketsWhereInput {
    if (!search) {
      return {};
    }
    return {
      OR: [
        { title: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ],
    };
  }

  private buildOrderBy(
    sortField: string | undefined,
    sortOrder: 'asc' | 'desc' | undefined,
  ): Prisma.TicketsOrderByWithRelationInput {
    const field = (TICKET_SORTABLE_FIELDS as readonly string[]).includes(sortField ?? '')
      ? (sortField as TicketSortField)
      : 'createdAt';
    const direction: Prisma.SortOrder = sortOrder === 'asc' ? 'asc' : 'desc';
    return { [field]: direction };
  }

  private assertDueDateNotPast(dueDate: string | undefined): void {
    if (!dueDate) {
      return;
    }
    const due = new Date(dueDate);
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    if (due.getTime() < startOfToday.getTime()) {
      throw new BadRequestException('Due date cannot be in the past.');
    }
  }

  /** Only enforce the not-past rule when the due date is actually being changed,
   *  so editing a ticket that already has a past due date stays possible. */
  private assertDueDateNotPastOnChange(dueDate: string | null | undefined, existing: Date | null): void {
    if (!dueDate) {
      // not provided, or being cleared — nothing to validate
      return;
    }
    if (existing && new Date(dueDate).getTime() === existing.getTime()) {
      return;
    }
    this.assertDueDateNotPast(dueDate);
  }

  private generateTicketNumber(): number {
    return randomInt(TICKET_NUMBER_MIN, TICKET_NUMBER_MAX + 1);
  }

  private isTicketNumberCollision(error: unknown): boolean {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') {
      return false;
    }
    // meta.target may be a string (constraint name) or string[] (field/column names)
    // depending on the connector/version; match either against the ticket-number unique.
    const target = error.meta?.target;
    const haystack = Array.isArray(target) ? target.join(',') : String(target ?? '');
    return haystack.toLowerCase().includes('ticket_number') || haystack.includes('ticketNumber');
  }
}
