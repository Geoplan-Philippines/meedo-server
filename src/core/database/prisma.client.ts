import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

import { env } from '../config/env.config';

/**
 * Global PrismaClient instance shared across the application.
 * This ensures we use a single connection pool and same database state
 * both within NestJS DI context and outside (decorators, helpers).
 */
export const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: env.DATABASE_URL,
  }),
});