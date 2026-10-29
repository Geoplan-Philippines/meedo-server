import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { isOrgAdminRole } from '../../../common/constants/org-roles.constants';
import { PrismaService } from '../../../core/database/prisma.service';
import { TICKET_DETAIL_INCLUDE } from '../constants/ticket.constants';

export interface TicketDepartmentScope {
  readonly organizationId: string;
  readonly userId: string;
  readonly memberId: string;
  readonly role: string;
  readonly isAdmin: boolean;
  readonly teamIds: readonly string[];
}

type AccessClient = Pick<Prisma.TransactionClient, 'member' | 'teamMember' | 'tickets'>;

/** Resolved once per request, never cached across requests or organizations. */
@Injectable()
export class TicketDepartmentAccessService {
  constructor(private readonly prisma: PrismaService) {}

  async resolve(
    organizationId: string | null | undefined,
    userId: string | null | undefined,
    client: AccessClient = this.prisma,
  ): Promise<TicketDepartmentScope> {
    if (!organizationId || !userId) {
      throw new ForbiddenException('A signed-in organization member is required.');
    }
    const member = await client.member.findUnique({
      where: { organizationId_userId: { organizationId, userId } },
      select: { id: true, role: true },
    });
    if (!member) throw new ForbiddenException('You are not a member of this organization.');
    const isAdmin = isOrgAdminRole(member.role);
    const teams = isAdmin ? [] : await client.teamMember.findMany({
      where: { userId, team: { organizationId } },
      select: { teamId: true },
    });
    return { organizationId, userId, memberId: member.id, role: member.role, isAdmin,
      teamIds: teams.map(({ teamId }) => teamId) };
  }

  where(scope: TicketDepartmentScope, filter: Prisma.TicketsWhereInput = {}): Prisma.TicketsWhereInput {
    if (scope.isAdmin) return { ...filter, organizationId: scope.organizationId };
    return { AND: [{ organizationId: scope.organizationId, OR: [{ teamId: { in: [...scope.teamIds] } }, { createdById: scope.userId }] }, filter] };
  }

  async assertTicket(scope: TicketDepartmentScope, id: string, client: AccessClient = this.prisma): Promise<void> {
    const ticket = await client.tickets.findFirst({ where: this.where(scope, { id }), select: { id: true } });
    if (!ticket) throw new NotFoundException('Ticket not found in this organization.');
  }

  assertTeam(scope: TicketDepartmentScope, teamId: string | null | undefined): void {
    if (!scope.isAdmin && (!teamId || !scope.teamIds.includes(teamId))) {
      throw new ForbiddenException('Choose one of your departments for this ticket.');
    }
  }

  detailInclude(scope: TicketDepartmentScope) {
    return { ...TICKET_DETAIL_INCLUDE, relatedTickets: {
      ...TICKET_DETAIL_INCLUDE.relatedTickets,
      where: { relatedTicket: this.where(scope) },
    } } satisfies Prisma.TicketsInclude;
  }

  /** Parameterized predicate for future raw-SQL consumers; alias is deliberately fixed. */
  sql(scope: TicketDepartmentScope): Prisma.Sql {
    const organization = Prisma.sql`t.organization_id = ${scope.organizationId}`;
    if (scope.isAdmin) return organization;
    if (!scope.teamIds.length) return Prisma.sql`${organization} AND t.created_by_id = ${scope.userId}`;
    return Prisma.sql`${organization} AND (t.team_id IN (${Prisma.join([...scope.teamIds])}) OR t.created_by_id = ${scope.userId})`;
  }
}
