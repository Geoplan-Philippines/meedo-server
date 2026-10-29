import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../core/database/prisma.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { TimesheetService } from './timesheet.service';

describe('timesheet project picker visibility only', () => {
  it.each(['owner', 'admin', 'member'])('scopes the project lookup for %s without filtering closed projects', async role => {
    const prisma = { member: { findUnique: jest.fn().mockResolvedValue({ id: 'example-member', role }) }, $queryRaw: jest.fn().mockResolvedValue([]) };
    const service = new TimesheetService(prisma as unknown as PrismaService, {} as NotificationsService);
    await service.getProjects('example-org', 'example-user', { page: 1, limit: 20 });
    const queries = prisma.$queryRaw.mock.calls as [Prisma.Sql][];
    expect(queries).toHaveLength(2);
    for (const [query] of queries) {
      expect(query.sql).toContain('FROM project_members pm');
      expect(query.sql).toContain('pm.organization_id = ? AND pm.user_id = ?');
      expect(query.values).toContain(role !== 'member');
      expect(query.values).toContain('example-user');
      expect(query.values).toContain('example-org');
      expect(query.sql).not.toContain('is_closed');
    }
  });
});
