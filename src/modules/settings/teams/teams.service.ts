import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../../../core/database/prisma.service';

/** Team member shape returned to the client — the link row plus the linked user. */
const TEAM_MEMBER_SELECT = {
  id: true,
  teamId: true,
  userId: true,
  createdAt: true,
  user: { select: { id: true, name: true, email: true, image: true } },
} as const;

@Injectable()
export class TeamsService {
  constructor(private prisma: PrismaService) {}

  /**
   * Members assigned to a team, scoped to the organization.
   *
   * Unlike Better Auth's `list-team-members`, this does NOT require the caller
   * to be a member of the team — the ticket assignee picker needs a team's roster
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
   * link row — the user, their org membership, and their ticket history are all
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
  private async assertOrgMember(userId: string, organizationId: string): Promise<void> {
    const member = await this.prisma.member.findFirst({
      where: { userId, organizationId },
      select: { id: true },
    });
    if (!member) {
      throw new BadRequestException('User is not a member of this organization.');
    }
  }
}
