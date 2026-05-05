import "dotenv/config";

import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const prisma = new PrismaClient({
    adapter: new PrismaPg({
        connectionString: process.env.DATABASE_URL,
    }),
});

export const auth = betterAuth({
    baseURL: process.env.APP_URL,
    basePath: "/api/v1/auth",

    database: prismaAdapter(prisma, {
        provider: 'postgresql',
    }),
    
    emailAndPassword: {
        enabled: true,
    },

    trustedOrigins: [
        "http://localhost:4200",
    ]
}); 