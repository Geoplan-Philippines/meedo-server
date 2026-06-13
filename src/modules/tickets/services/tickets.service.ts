import { BadRequestException, Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { Prisma, TicketActivityType, TicketPriority } from '@prisma/client';
import { randomInt } from 'node:crypto';

import { PrismaService } from '../../../core/database/prisma.service';
import { PaginatedResponse, buildPaginationMeta } from 'src/common/responses/paginated-api.response';
import { CreateTicketDTO } from '../dto/create-ticket.dto';
import { UpdateTicketDTO } from '../dto/update-ticket.dto';
import { GetAllTicketsQueryDTO } from '../dto/get-all-tickets-query.dto';
import { TicketActivityService } from './ticket-activity.service';
import {
  MAX_TICKET_NUMBER_RETRIES,
  TICKET_INCLUDE,
  TICKET_NUMBER_MAX,
  TICKET_NUMBER_MIN,
  TICKET_SORTABLE_FIELDS,
  TicketSortField,
  TicketStats,
  TicketWithRelations,
} from '../constants/ticket.constants';

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
    const { page, limit, ticketStatusId, priority, categoryId, assigneeId, search, includeArchived } = query;

    const orderBy = this.buildOrderBy(query.sortField, query.sortOrder);

    const where: Prisma.TicketsWhereInput = {
      organizationId,
      ...(includeArchived ? {} : { isArchived: false }),
      ...(ticketStatusId ? { ticketStatusId } : {}),
      ...(priority ? { priority } : {}),
      ...(categoryId ? { categoryId } : {}),
      ...(assigneeId ? { assignees: { some: { memberId: assigneeId } } } : {}),
      ...(search
        ? {
            OR: [
              { title: { contains: search, mode: 'insensitive' } },
              { description: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
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
        ticket = await this.prisma.tickets.create({
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

    await this.activity.record(this.prisma, {
      ticketId: ticket.id,
      actorMemberId,
      type: TicketActivityType.CREATED,
    });

    return ticket;
  }

  async updateTicket(
    id: string,
    data: UpdateTicketDTO,
    organizationId: string,
    userId?: string,
  ): Promise<TicketWithRelations> {
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

    const actorMemberId = await this.activity.resolveMemberId(organizationId, userId);
    const { assigneeIds, ...ticketData } = data;

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

      await this.recordUpdateActivities(tx, id, actorMemberId, existing, data, assigneeIds);

      return tx.tickets.findUniqueOrThrow({
        where: { id },
        include: TICKET_INCLUDE,
      });
    });
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
