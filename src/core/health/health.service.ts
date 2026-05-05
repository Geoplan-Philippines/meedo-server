import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/core/database/prisma.service';

@Injectable()
export class HealthService {
  constructor(private readonly prisma: PrismaService) {}

  async check() {
    let db = 'ok';

    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      db = 'error';
    }

    return {
      status: 'ok',
      database: db,
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    };
  }
}
