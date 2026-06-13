import { Injectable } from '@nestjs/common';
import { Prisma, TicketActivityType } from '@prisma/client';

import { PrismaService } from '../../../core/database/prisma.service';

type ActivityClient = Pick<Prisma.TransactionClient, 'ticketActivity'>;

interface RecordActivityParams {
  ticketId: string;
  actorMemberId: string | null;
  type: TicketActivityType;
  meta?: Record<string, unknown>;
}

@Injectable()
export class TicketActivityService {
  constructor(private prisma: PrismaService) {}

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
}
