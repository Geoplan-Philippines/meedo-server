import { prisma } from "../database/prisma.client";

import { DEFAULT_STATUSES } from "src/common/constants/statuses.constants";

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
    await prisma.status.createMany({
      data: DEFAULT_STATUSES.map((status) => ({
        ...status,
        organizationId: organization.id,
      })),
    });
  },
};
