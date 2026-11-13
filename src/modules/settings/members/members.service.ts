import { ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../../core/database/prisma.service';
import { PaginatedResponse } from '../../../common/responses/paginated-api.response';
import { containsInsensitive, pageArgs, termSearchWhere, toPage } from '../../../common/utils/pagination.util';
import { GetMembersQueryDTO } from './dto/get-members-query.dto';

export const MEMBER_LIST_SELECT = {
  id: true,
  organizationId: true,
  userId: true,
  role: true,
  createdAt: true,
  user: { select: { id: true, name: true, email: true, image: true } },
} satisfies Prisma.MemberSelect;

export type MemberListRow = Prisma.MemberGetPayload<{ select: typeof MEMBER_LIST_SELECT }>;

@Injectable()
export class MembersService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * One page of the organization's members, for the users list and the
   * assignee pickers. Any member of the organization may read it (the same
   * people Better Auth's full-organization call already exposed).
   */
  async listMembers(query: GetMembersQueryDTO, organizationId: string, userId?: string): Promise<PaginatedResponse<MemberListRow>> {
    await this.assertMember(organizationId, userId);
    const where: Prisma.MemberWhereInput = {
      organizationId,
      ...(query.role ? { role: query.role } : {}),
      ...(query.teamId ? { user: { teamMembers: { some: { teamId: query.teamId, team: { organizationId } } } } } : {}),
      ...termSearchWhere<Prisma.MemberWhereInput>(query.search, (term) => [
        { user: { name: containsInsensitive(term) } },
        { user: { email: containsInsensitive(term) } },
      ]),
    };

    const [data, total] = await Promise.all([
      this.prisma.member.findMany({
        where,
        select: MEMBER_LIST_SELECT,
        orderBy: [memberOrderBy(query), { id: 'asc' }],
        ...pageArgs(query),
      }),
      this.prisma.member.count({ where }),
    ]);
    return toPage(data, total, query);
  }

  private async assertMember(organizationId: string, userId?: string): Promise<void> {
    if (!userId) throw new ForbiddenException('A signed-in organization member is required.');
    const member = await this.prisma.member.findUnique({
      where: { organizationId_userId: { organizationId, userId } },
      select: { id: true },
    });
    if (!member) throw new ForbiddenException('Organization membership is required.');
  }
}

function memberOrderBy(query: GetMembersQueryDTO): Prisma.MemberOrderByWithRelationInput {
  const field = query.sortField ?? 'name';
  const order = query.sortOrder ?? (field === 'createdAt' ? 'desc' : 'asc');
  switch (field) {
    case 'name':
      // Members without a name sort after named ones, in either direction.
      return { user: { name: { sort: order, nulls: 'last' } } };
    case 'email':
      return { user: { email: order } };
    default:
      return { [field]: order };
  }
}
