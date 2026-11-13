import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../../core/database/prisma.service';
import { PaginatedResponse } from '../../../common/responses/paginated-api.response';
import { containsInsensitive, pageArgs, toPage } from '../../../common/utils/pagination.util';
import { GetTeamsQueryDTO } from './dto/get-teams-query.dto';

/** Team member shape returned to the client. It includes the link row and the linked user. */
const TEAM_MEMBER_SELECT = {
  id: true,
  teamId: true,
  userId: true,
  createdAt: true,
  user: { select: { id: true, name: true, email: true, image: true } },
} as const;

const TEAM_LIST_SELECT = {
  id: true,
  name: true,
  organizationId: true,
  createdAt: true,
  updatedAt: true,
  _count: { select: { teamMembers: true } },
} satisfies Prisma.TeamSelect;

export type TeamListRow = Omit<Prisma.TeamGetPayload<{ select: typeof TEAM_LIST_SELECT }>, '_count'> & { memberCount: number };

@Injectable()
export class TeamsService {
  constructor(private prisma: PrismaService) {}

  /** One page of the organization's teams with member counts; `mine` keeps the caller's own teams. */
  async listTeams(query: GetTeamsQueryDTO, organizationId: string, userId?: string): Promise<PaginatedResponse<TeamListRow>> {
    if (!userId) throw new ForbiddenException('A signed-in organization member is required.');
    await this.assertOrgMember(userId, organizationId, ForbiddenException);
    const where: Prisma.TeamWhereInput = {
      organizationId,
      ...(query.mine ? { teamMembers: { some: { userId } } } : {}),
      ...(query.search ? { name: containsInsensitive(query.search) } : {}),
    };
    const field = query.sortField ?? 'name';
    const order = query.sortOrder ?? (field === 'createdAt' ? 'desc' : 'asc');
    const orderBy: Prisma.TeamOrderByWithRelationInput =
      field === 'memberCount' ? { teamMembers: { _count: order } } : { [field]: order };

    const [teams, total] = await Promise.all([
      this.prisma.team.findMany({ where, select: TEAM_LIST_SELECT, orderBy: [orderBy, { id: 'asc' }], ...pageArgs(query) }),
      this.prisma.team.count({ where }),
    ]);
    return toPage(
      teams.map(({ _count, ...team }) => ({ ...team, memberCount: _count.teamMembers })),
      total,
      query,
    );
  }

  /**
   * Members assigned to a team, scoped to the organization.
   *
   * Unlike Better Auth's `list-team-members`, this does NOT require the caller
   * to be a member of the team. The ticket assignee picker needs a team's roster
   * regardless of who is looking. An empty team correctly returns `[]` (no members),
   * which callers must treat as "no one", never as "everyone".
   */
  async listTeamMembers(teamId: string, organizationId: string) {
    await this.assertTeamInOrg(teamId, organizationId);
    return this.prisma.teamMember.findMany({
      where: { teamId },
      orderBy: { createdAt: 'asc' },
      select: TEAM_MEMBER_SELECT,
    });
  }

  /**
   * Assign an organization member to a team. Idempotent: re-adding an existing
   * member is a no-op that returns the existing link (never a duplicate or error),
   * so this endpoint never removes or overwrites data.
   */
  async addTeamMember(teamId: string, userId: string, organizationId: string) {
    await this.assertTeamInOrg(teamId, organizationId);
    await this.assertOrgMember(userId, organizationId);
    return this.prisma.teamMember.upsert({
      where: { teamId_userId: { teamId, userId } },
      update: {},
      create: { teamId, userId },
      select: TEAM_MEMBER_SELECT,
    });
  }

  /**
   * Remove a member's assignment from a team. This deletes only the team↔user
   * link row. The user, their org membership, and their ticket history are all
   * untouched. Idempotent: removing a member who isn't on the team is a no-op.
   */
  async removeTeamMember(teamId: string, userId: string, organizationId: string) {
    await this.assertTeamInOrg(teamId, organizationId);
    await this.prisma.teamMember.deleteMany({ where: { teamId, userId } });
    return { teamId, userId };
  }

  /** Guards every operation to a team the caller's organization actually owns. */
  private async assertTeamInOrg(teamId: string, organizationId: string): Promise<void> {
    const team = await this.prisma.team.findFirst({
      where: { id: teamId, organizationId },
      select: { id: true },
    });
    if (!team) {
      throw new NotFoundException('Team not found in this organization.');
    }
  }

  /** A team member must first be a member of the organization the team belongs to. */
  private async assertOrgMember(
    userId: string,
    organizationId: string,
    Failure: typeof BadRequestException | typeof ForbiddenException = BadRequestException,
  ): Promise<void> {
    const member = await this.prisma.member.findFirst({
      where: { userId, organizationId },
      select: { id: true },
    });
    if (!member) {
      throw new Failure('User is not a member of this organization.');
    }
  }
}
