import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { organization } from "better-auth/plugins";

import { env } from "../config/env.config";
import { prisma } from "../database/prisma.client";
import { sessionHooks, organizationHooks } from "./auth.hooks";
import { sessionDiagnostics } from "./session-diagnostics.plugin";

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
    // Says in the API log why a session 401 happened; better-auth reports them all as "Unauthorized".
    sessionDiagnostics(),
  ],

  trustedOrigins: env.CORS_ALLOWED_ORIGINS,
});
