import { ServiceUnavailableException } from '@nestjs/common';

import { PrismaService } from '../../core/database/prisma.service';
import { DEFAULT_PUBLIC_ORG_SLUG } from './crm.constants';

export async function resolveDefaultOrganizationId(prisma: PrismaService): Promise<string> {
  const organization = await prisma.organization.findUnique({
    where: { slug: DEFAULT_PUBLIC_ORG_SLUG },
    select: { id: true },
  });
  if (!organization) {
    throw new ServiceUnavailableException(
      `Default organization '${DEFAULT_PUBLIC_ORG_SLUG}' is missing. Seed it before accepting public submissions.`,
    );
  }
  return organization.id;
}
