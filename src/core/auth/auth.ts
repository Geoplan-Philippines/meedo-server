import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { organization } from "better-auth/plugins";

import { env } from "../config/env.config";
import { prisma } from "../database/prisma.client";

export const auth = betterAuth({
  baseURL: env.APP_URL,
  basePath: "/api/v1/auth",

  database: prismaAdapter(prisma, {
    provider: 'postgresql',
  }),

  emailAndPassword: {
    enabled: true,
  },

  databaseHooks: {
    session: {
      create: {
        before: async (session) => {
          const member = await prisma.member.findFirst({
            where: { userId: session.userId },
            orderBy: { createdAt: 'asc' },
            select: { organizationId: true },
          });

          if (session.activeOrganizationId) return { data: session };

          return {
            data: {
              ...session,
              activeOrganizationId: member?.organizationId ?? null,
            },
          };
        },
      },
    },
  },

  plugins: [
    organization({
      teams: {
        enabled: true,
      },
    }),
  ],

  trustedOrigins: env.CORS_ALLOWED_ORIGINS,
});
