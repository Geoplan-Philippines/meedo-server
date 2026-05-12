import "dotenv/config";

import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { organization } from "better-auth/plugins";

import { prisma } from "../database/prisma.client";

const appUrl = process.env.APP_URL;

if (!appUrl) {
  throw new Error('APP_URL is fucking required, dipshit');
}

export const auth = betterAuth({
  baseURL: appUrl,
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
    organization(),
  ],

  trustedOrigins: [
    "http://localhost:4200",
  ],
});
