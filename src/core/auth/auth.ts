import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { organization } from "better-auth/plugins";

import { env } from "../config/env.config";
import { prisma } from "../database/prisma.client";
import { sessionHooks, organizationHooks } from "./auth.hooks";

export const auth = betterAuth({
  baseURL: env.APP_URL,
  basePath: "/api/v1/auth",

  database: prismaAdapter(prisma, { provider: 'postgresql' }),

  advanced: { database: { generateId: false } },

  emailAndPassword: { enabled: true },

  databaseHooks: {
    session: sessionHooks,
  },

  plugins: [
    organization({
      teams: { enabled: true },
      organizationHooks,
    }),
  ],

  trustedOrigins: env.CORS_ALLOWED_ORIGINS,
});
