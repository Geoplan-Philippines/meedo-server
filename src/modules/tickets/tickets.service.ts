import { BadRequestException, Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { Prisma, TicketActivityType, TicketPriority } from '@prisma/client';

import { PrismaService } from '../../core/database/prisma.service';
import { PaginatedResponse, buildPaginationMeta } from 'src/common/responses/paginated-api.response';
import { CreateTicketDTO } from './dto/create-ticket.dto';
import { UpdateTicketDTO } from './dto/update-ticket.dto';
import { GetAllTicketsQueryDTO } from './dto/get-all-tickets-query.dto';
import { GetTicketFacetsQueryDTO } from './dto/get-ticket-facets-query.dto';
import { TicketActivityService } from './activity/ticket-activity.service';
import {
  TICKET_DETAIL_INCLUDE,
  TICKET_INCLUDE,
  TICKET_SORTABLE_FIELDS,
  TICKET_VIEW_CATEGORIES,
  TicketDetail,
  TicketFacets,
  TicketSortField,
  TicketStats,
  TicketView,
  TicketWithRelations,
  parseTicketKey,
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
    const { page, limit, ticketStatusId, priority, teamId, categoryId, assigneeId, projectId, search, includeArchived, view } = query;

    const orderBy = this.buildOrderBy(query.sortField, query.sortOrder);

    const where: Prisma.TicketsWhereInput = {
      organizationId,
      ...(includeArchived ? {} : { isArchived: false }),
      ...this.buildViewWhere(view),
      ...(ticketStatusId?.length ? { ticketStatusId: { in: ticketStatusId } } : {}),
      ...(priority?.length ? { priority: { in: priority } } : {}),
      ...this.buildScopeWhere({ teamId, categoryId, assigneeId, projectId }),
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
    const { search, includeArchived, view, teamId, categoryId, assigneeId, projectId } = query;

    // Context shared by every count: org + archived scope + the active search and
    // scope filters (team/category/assignee), so badge counts match the list. Only
    // the status/priority selections are omitted, so each option's badge shows what
    // picking it would yield.
    const contextWhere: Prisma.TicketsWhereInput = {
      organizationId,
      ...(includeArchived ? {} : { isArchived: false }),
      ...this.buildScopeWhere({ teamId, categoryId, assigneeId, projectId }),
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

    // Number allocation, the ticket and its CREATED activity share one
    // transaction so the audit trail can never start without the opening event
    // and a failure rolls back the reserved number instead of burning it.
    return this.prisma.$transaction(async (tx) => {
      const number = await this.allocateTicketNumber(tx, data.projectId);

      const created = await tx.tickets.create({
        data: {
          number,
          title: data.title,
          description: data.description,
          priority: data.priority,
          dueDate: data.dueDate,
          organization: { connect: { id: organizationId } },
          project: { connect: { id: data.projectId } },
          workOrder: data.workOrderId ? { connect: { id: data.workOrderId } } : undefined,
          ticketStatus: data.ticketStatusId ? { connect: { id: data.ticketStatusId } } : undefined,
          category: data.categoryId ? { connect: { id: data.categoryId } } : undefined,
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
  }

  async archiveTicket(id: string, organizationId: string, userId?: string): Promise<TicketDetail> {
    return this.setTicketArchived(id, organizationId, true, userId);
  }

  async restoreTicket(id: string, organizationId: string, userId?: string): Promise<TicketDetail> {
    return this.setTicketArchived(id, organizationId, false, userId);
  }

  /**
   * Hard delete. Archiving is the reversible option and what the UI offers by
   * default; this exists for genuine mistakes. Comments, activity, assignees and
   * relation rows cascade from the schema.
   */
  async deleteTicket(id: string, organizationId: string): Promise<void> {
    const existing = await this.prisma.tickets.findFirst({
      where: { id, organizationId },
      select: { id: true },
    });
    if (!existing) {
      throw new NotFoundException('Ticket not found in this organization.');
    }

    await this.prisma.tickets.delete({ where: { id } });
  }

  private async setTicketArchived(
    id: string,
    organizationId: string,
    isArchived: boolean,
    userId?: string,
  ): Promise<TicketDetail> {
    const existing = await this.prisma.tickets.findFirst({
      where: { id, organizationId },
      select: { id: true, isArchived: true },
    });
    if (!existing) {
      throw new NotFoundException('Ticket not found in this organization.');
    }
    if (existing.isArchived === isArchived) {
      throw new BadRequestException(
        isArchived ? 'Ticket is already archived.' : 'Ticket is not archived.',
      );
    }

    const actorMemberId = await this.activity.resolveMemberId(organizationId, userId);

    return this.prisma.$transaction(async (tx) => {
      await tx.tickets.update({ where: { id }, data: { isArchived } });

      await this.activity.record(tx, {
        ticketId: id,
        actorMemberId,
        type: isArchived ? TicketActivityType.ARCHIVED : TicketActivityType.RESTORED,
      });

      const updated = await tx.tickets.findUniqueOrThrow({
        where: { id },
        include: TICKET_DETAIL_INCLUDE,
      });
      return serializeTicketDetail(updated);
    });
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
        projectId: true,
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

    // Numbers are only unique within a project, so a ticket moving to another
    // project takes a fresh number from its new home. Its old identifier is not
    // reused, matching how the rest of the sequence behaves.
    const movingToProject =
      ticketData.projectId !== undefined && ticketData.projectId !== existing.projectId
        ? ticketData.projectId
        : null;

    return this.prisma.$transaction(async (tx) => {
      await tx.tickets.update({
        where: { id, organizationId },
        data: {
          ...ticketData,
          ...(movingToProject ? { number: await this.allocateTicketNumber(tx, movingToProject) } : {}),
        },
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
        select: { id: true, isArchived: true },
      });
      if (!project) {
        throw new NotFoundException('Project not found in this organization.');
      }
      if (project.isArchived) {
        throw new BadRequestException('Cannot file tickets against an archived project.');
      }
    }

    if (data.workOrderId) {
      const workOrder = await this.prisma.workOrder.findFirst({
        where: { id: data.workOrderId, organizationId },
        select: { id: true },
      });
      if (!workOrder) {
        throw new NotFoundException('Work order not found in this organization.');
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

  /** Scope filters shared by the ticket list and its facet counts, so both agree
   *  on which tickets are in view. Absent filters contribute nothing. */
  private buildScopeWhere(scope: {
    teamId?: string[];
    categoryId?: string;
    assigneeId?: string;
    projectId?: string;
  }): Prisma.TicketsWhereInput {
    return {
      ...(scope.teamId?.length ? { teamId: { in: scope.teamId } } : {}),
      ...(scope.categoryId ? { categoryId: scope.categoryId } : {}),
      ...(scope.assigneeId ? { assignees: { some: { memberId: scope.assigneeId } } } : {}),
      ...(scope.projectId ? { projectId: scope.projectId } : {}),
    };
  }

  private buildSearchWhere(search: string | undefined): Prisma.TicketsWhereInput {
    if (!search) {
      return {};
    }

    const OR: Prisma.TicketsWhereInput[] = [
      { title: { contains: search, mode: 'insensitive' } },
      { description: { contains: search, mode: 'insensitive' } },
    ];

    // Let people paste a ticket identifier straight into the search box.
    const key = parseTicketKey(search);
    if (key) {
      OR.push({
        number: key.number,
        ...(key.projectKey ? { project: { is: { key: key.projectKey } } } : {}),
      });
    }

    return { OR };
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

  /**
   * Reserves the next number in the project's sequence. The UPDATE takes a row
   * lock on the project, so concurrent creates serialize here rather than
   * racing to collide on the (projectId, number) unique.
   */
  private async allocateTicketNumber(
    tx: Prisma.TransactionClient,
    projectId: string,
  ): Promise<number> {
    const { nextTicketNumber } = await tx.project.update({
      where: { id: projectId },
      data: { nextTicketNumber: { increment: 1 } },
      select: { nextTicketNumber: true },
    });
    return nextTicketNumber - 1;
  }
}
