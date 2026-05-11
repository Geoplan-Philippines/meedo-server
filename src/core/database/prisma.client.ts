import "dotenv/config";

import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not set');
}

/**
 * Global PrismaClient instance shared across the application.
 * This ensures we use a single connection pool and same database state
 * both within NestJS DI context and outside (decorators, helpers).
 */
export const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: process.env.DATABASE_URL,
  }),
});