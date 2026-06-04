import { Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { Prisma, Tickets } from '@prisma/client';
import { randomInt } from 'node:crypto';

import { PrismaService } from '../../core/database/prisma.service';
import { PaginatedResponse } from 'src/common/responses/paginated-api.response';
import { CreateTicketDTO } from './dto/create-ticket.dto';
import { UpdateTicketDTO } from './dto/update-ticket.dto';
import { GetAllTicketsQueryDTO } from './dto/get-all-tickets-query.dto';
import { MAX_TICKET_NUMBER_RETRIES, TICKET_NUMBER_MAX, TICKET_NUMBER_MIN } from './constants/ticket-number.constants';

const TICKET_INCLUDE = {
  ticketStatus: true,
  category: true,
  project: true,
  team: true,
  assignee: { include: { user: true } },
} satisfies Prisma.TicketsInclude;

type TicketWithRelations = Prisma.TicketsGetPayload<{ include: typeof TICKET_INCLUDE }>;

@Injectable()
export class TicketsService {
  constructor(private prisma: PrismaService) {}

  async getAllTickets(query: GetAllTicketsQueryDTO, organizationId: string): Promise<PaginatedResponse<TicketWithRelations>> {
    const { page, limit } = query;

    const [tickets, total] = await Promise.all([
      this.prisma.tickets.findMany({
        where: { organizationId },
        include: TICKET_INCLUDE,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.tickets.count({ where: { organizationId } }),
    ]);

    return {
      data: tickets,
      meta: {
        total,
        limit,
        page,
        lastPage: Math.ceil(total / limit),
      },
    };
  }

  async createTicket(data: CreateTicketDTO, organizationId: string): Promise<Tickets> {
    await this.validateReferences(data, organizationId);

    for (let attempt = 0; attempt < MAX_TICKET_NUMBER_RETRIES; attempt++) {
      try {
        return await this.prisma.tickets.create({
          data: {
            ticketNumber: this.generateTicketNumber(),
            title: data.title,
            description: data.description,
            priority: data.priority,
            dueDate: data.dueDate,
            organization: { connect: { id: organizationId } },
            ticketStatus: { connect: { id: data.ticketStatusId } },
            category: data.categoryId ? { connect: { id: data.categoryId } } : undefined,
            project: data.projectId ? { connect: { id: data.projectId } } : undefined,
            team: data.teamId ? { connect: { id: data.teamId } } : undefined,
            assignee: data.assigneeId ? { connect: { id: data.assigneeId } } : undefined,
          },
        });
      } catch (error) {
        if (this.isTicketNumberCollision(error)) {
          continue;
        }
        throw error;
      }
    }

    throw new InternalServerErrorException(
      'Failed to generate a unique ticket number. Please try again.',
    );
  }

  async updateTicket(id: string, data: UpdateTicketDTO, organizationId: string): Promise<Tickets> {
    await this.validateReferences(data, organizationId);

    return this.prisma.tickets.update({
      where: { id, organizationId },
      data: {
        title: data.title,
        description: data.description,
        priority: data.priority,
        dueDate: data.dueDate,
        ticketStatusId: data.ticketStatusId,
        categoryId: data.categoryId,
        projectId: data.projectId,
        teamId: data.teamId,
        assigneeId: data.assigneeId,
      },
    });
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

    if (data.assigneeId) {
      const assignee = await this.prisma.teamMember.findFirst({
        where: { id: data.assigneeId, team: { organizationId } },
        select: { id: true },
      });
      if (!assignee) {
        throw new NotFoundException('Assignee not found in this organization.');
      }
    }

    if (data.projectId) {
      const project = await this.prisma.project.findUnique({
        where: { id: data.projectId },
        select: { id: true },
      });
      if (!project) {
        throw new NotFoundException('Project not found.');
      }
    }
  }

  private generateTicketNumber(): number {
    return randomInt(TICKET_NUMBER_MIN, TICKET_NUMBER_MAX + 1);
  }

  private isTicketNumberCollision(error: unknown): boolean {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002' &&
      (error.meta?.target as string[] | undefined)?.includes('ticket_number') === true
    );
  }
}
