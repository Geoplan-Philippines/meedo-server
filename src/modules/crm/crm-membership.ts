import { ForbiddenException } from '@nestjs/common';

import { isOrgAdminRole } from '../../common/constants/org-roles.constants';
import { PrismaService } from '../../core/database/prisma.service';

export async function requireCrmMembership(
  prisma: PrismaService,
  organizationId: string,
  userId: string,
  options: { admin?: boolean } = {},
) {
  if (!organizationId || !userId) {
    throw new ForbiddenException('A signed-in organization member is required.');
  }

  const member = await prisma.member.findUnique({
    where: { organizationId_userId: { organizationId, userId } },
    select: { id: true, role: true },
  });
  if (!member) {
    throw new ForbiddenException('You are not a member of this organization.');
  }
  if (options.admin && !isOrgAdminRole(member.role)) {
    throw new ForbiddenException('An organization owner or admin is required.');
  }
  return member;
}
