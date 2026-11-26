import { prisma } from "../database/prisma.client";

import { SYSTEM_STATUSES } from "src/common/constants/statuses.constants";
import { seedLeadSystemFields } from "src/modules/crm/field-definitions/system-fields";

export const sessionHooks = {
  create: {
    before: async (session: { userId: string; activeOrganizationId?: string | null }) => {
      if (session.activeOrganizationId) return { data: session };

      const member = await prisma.member.findFirst({
        where: { userId: session.userId },
        orderBy: { createdAt: 'asc' },
        select: { organizationId: true },
      });

      return {
        data: {
          ...session,
          activeOrganizationId: member?.organizationId ?? null,
        },
      };
    },
  },
};

export const organizationHooks = {
  afterCreateOrganization: async ({ organization }: { organization: { id: string } }) => {
    await prisma.ticketStatus.createMany({
      data: SYSTEM_STATUSES.map((status) => ({
        ...status,
        isSystem: true,
        organizationId: organization.id,
      })),
    });
    await seedLeadSystemFields(prisma, organization.id);
  },
};
