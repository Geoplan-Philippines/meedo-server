import { Injectable } from '@nestjs/common';
import { Prisma, TicketActivityType } from '@prisma/client';

import { PrismaService } from '../../../core/database/prisma.service';
import { PaginatedResponse, buildPaginationMeta } from 'src/common/responses/paginated-api.response';
import { PaginationQueryDTO } from 'src/common/dto/pagination-query.dto';
import { ACTIVITY_INCLUDE, ActivityWithActor } from '../constants/ticket.constants';
import { TicketDepartmentAccessService } from '../access/ticket-department-access.service';

type ActivityClient = Pick<Prisma.TransactionClient, 'ticketActivity'>;

interface RecordActivityParams {
  ticketId: string;
  actorMemberId: string | null;
  type: TicketActivityType;
  meta?: Record<string, unknown>;
}

@Injectable()
export class TicketActivityService {
  constructor(private prisma: PrismaService, private access: TicketDepartmentAccessService) {}

  async resolveMember(
    organizationId: string,
    userId?: string | null,
  ): Promise<{ id: string; role: string } | null> {
    if (!userId) {
      return null;
    }

    return this.prisma.member.findUnique({
      where: { organizationId_userId: { organizationId, userId } },
      select: { id: true, role: true },
    });
  }

  async resolveMemberId(organizationId: string, userId?: string | null): Promise<string | null> {
    const member = await this.resolveMember(organizationId, userId);
    return member?.id ?? null;
  }

  async record(client: ActivityClient, params: RecordActivityParams): Promise<void> {
    await client.ticketActivity.create({
      data: {
        ticketId: params.ticketId,
        actorMemberId: params.actorMemberId,
        type: params.type,
        meta: params.meta === undefined ? undefined : (params.meta as Prisma.InputJsonValue),
      },
    });
  }

  async getActivity(
    ticketId: string,
    organizationId: string,
    query: PaginationQueryDTO,
    userId?: string,
  ): Promise<PaginatedResponse<ActivityWithActor>> {
    const scope = await this.access.resolve(organizationId, userId);
    await this.access.assertTicket(scope, ticketId);
    const where = { ticketId, ticket: this.access.where(scope) };
    const { page, limit } = query;

    const [activities, total] = await Promise.all([
      this.prisma.ticketActivity.findMany({
        where,
        include: ACTIVITY_INCLUDE,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.ticketActivity.count({ where }),
    ]);

    return { data: activities, meta: buildPaginationMeta(total, page, limit) };
  }

}
