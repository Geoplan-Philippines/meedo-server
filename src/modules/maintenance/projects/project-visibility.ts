import { ForbiddenException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { isOrgAdminRole } from '../../../common/constants/org-roles.constants';

export async function projectVisibility(db: Pick<Prisma.TransactionClient, 'member'>, organizationId: string, userId?: string) {
  if (!organizationId || !userId) throw new ForbiddenException('A signed-in organization member is required.');
  const member = await db.member.findUnique({ where: { organizationId_userId: { organizationId, userId } }, select: { id: true, role: true } });
  if (!member) throw new ForbiddenException('Organization membership is required.');
  return { organizationId, userId, isAdmin: isOrgAdminRole(member.role) };
}

export function visibleProjects(scope: { organizationId: string; userId: string; isAdmin: boolean }): Prisma.ProjectWhereInput {
  return scope.isAdmin ? {} : { members: { some: { organizationId: scope.organizationId, userId: scope.userId } } };
}
