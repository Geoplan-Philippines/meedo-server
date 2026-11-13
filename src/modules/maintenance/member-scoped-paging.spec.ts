import { Test, TestingModule } from '@nestjs/testing';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../core/database/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ClientsService } from './clients/clients.service';
import { ProjectsService } from './projects/projects.service';

/**
 * Members see only the clients and projects they belong to. These tests pin
 * that rule on every paged query: the Prisma `where`, the total `count`, and
 * the raw SQL behind name sorting.
 */
const prisma = {
  member: { findUnique: jest.fn() },
  client: { findMany: jest.fn(), count: jest.fn() },
  project: { findMany: jest.fn(), count: jest.fn(), groupBy: jest.fn() },
  $queryRaw: jest.fn<Promise<unknown>, [Prisma.Sql]>(),
};

const ORG = 'org-1';
const MEMBER_USER = 'member-user';
const memberVisibility = { members: { some: { organizationId: ORG, userId: MEMBER_USER } } };
const sqlOf = (call: number): Prisma.Sql => prisma.$queryRaw.mock.calls[call][0];

const client = { id: 'client-1', customerName: 'Acme', displayName: null, isArchived: false, _count: { projects: 2 } };

describe('member scoping in paged maintenance lists', () => {
  let clients: ClientsService;
  let projects: ProjectsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ClientsService,
        ProjectsService,
        { provide: PrismaService, useValue: prisma },
        { provide: NotificationsService, useValue: { createMany: jest.fn() } },
      ],
    }).compile();
    clients = module.get(ClientsService);
    projects = module.get(ProjectsService);
    jest.resetAllMocks();
    prisma.member.findUnique.mockResolvedValue({ id: 'm-1', role: 'member' });
    prisma.client.count.mockResolvedValue(1);
    prisma.project.count.mockResolvedValue(0);
    prisma.project.findMany.mockResolvedValue([]);
    prisma.project.groupBy.mockResolvedValue([]);
  });

  describe('clients list', () => {
    it('limits a member to clients of their projects in rows, counts and totals', async () => {
      prisma.client.findMany.mockResolvedValue([client]);

      const result = await clients.getAllClients({ page: 1, limit: 25, search: 'ac' }, ORG, MEMBER_USER);

      const where = {
        organizationId: ORG,
        projects: { some: { organizationId: ORG, ...memberVisibility } },
        isArchived: false,
        OR: [{ displayName: { contains: 'ac', mode: 'insensitive' } }, { customerName: { contains: 'ac', mode: 'insensitive' } }],
      };
      expect(prisma.client.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where,
        include: { _count: { select: { projects: { where: memberVisibility } } } },
      }));
      expect(prisma.client.count).toHaveBeenCalledWith({ where });
      expect(prisma.project.groupBy).toHaveBeenCalledWith(expect.objectContaining({
        where: { clientId: { in: ['client-1'] }, isArchived: false, ...memberVisibility },
      }));
      expect(result.meta).toEqual({ total: 1, page: 1, limit: 25, lastPage: 1 });
    });

    it('applies the same membership rule in the raw query behind name sorting', async () => {
      prisma.$queryRaw.mockResolvedValue([{ id: 'client-1' }]);
      prisma.client.findMany.mockResolvedValue([client]);

      const result = await clients.getAllClients({ page: 2, limit: 10, sortField: 'name', sortOrder: 'asc' }, ORG, MEMBER_USER);

      const { sql, values } = sqlOf(0);
      expect(sql).toContain('JOIN project_members pm');
      expect(sql).toContain('pm.user_id = ?');
      expect(sql).toMatch(/ORDER BY LOWER\(COALESCE.*\) ASC, c\.id/s);
      expect(values).toEqual(expect.arrayContaining([ORG, false, MEMBER_USER, 10]));
      expect(prisma.client.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: { in: ['client-1'] } } }));
      expect(result.data.map((row) => row.name)).toEqual(['Acme']);
    });

    it('lets admins see every client without a membership join', async () => {
      prisma.member.findUnique.mockResolvedValue({ id: 'm-2', role: 'admin' });
      prisma.client.findMany.mockResolvedValue([]);

      await clients.getAllClients({ page: 1, limit: 10 }, ORG, 'admin-user');

      expect(prisma.client.count).toHaveBeenCalledWith({ where: { organizationId: ORG, isArchived: false } });
    });
  });

  describe('client picker options', () => {
    it('pages lightweight rows and keeps a member to their clients', async () => {
      prisma.$queryRaw.mockResolvedValue([{ id: 'client-1' }]);
      prisma.client.findMany.mockResolvedValue([client]);

      const result = await clients.getClientOptions({ page: 1, limit: 20, search: '50%' }, ORG, MEMBER_USER);

      expect(result).toEqual({
        data: [{ id: 'client-1', customerName: 'Acme', isArchived: false, name: 'Acme' }],
        meta: { total: 1, page: 1, limit: 20, lastPage: 1 },
      });
      const { values } = sqlOf(0);
      expect(values).toEqual(expect.arrayContaining([MEMBER_USER, '%50\\%%']));
      expect(prisma.client.count).toHaveBeenCalledWith({ where: expect.objectContaining({ projects: { some: { organizationId: ORG, ...memberVisibility } } }) });
    });
  });

  describe('projects list', () => {
    it('limits a member to their projects in rows, total and client totals', async () => {
      prisma.project.findMany.mockResolvedValue([{ id: 'p-1', clientId: 'client-1', client: null, displayName: 'P', quoteSubject: null, workOrderNumber: null }]);
      prisma.project.count.mockResolvedValue(3);
      prisma.project.groupBy.mockResolvedValue([
        { clientId: 'client-1', _count: { _all: 2 } },
        { clientId: 'client-2', _count: { _all: 1 } },
      ]);

      const result = await projects.getAllProjects({ page: 1, limit: 25, withClientTotals: true, sortField: 'reportedDate', sortOrder: 'desc' }, ORG, MEMBER_USER);

      const where = expect.objectContaining({ organizationId: ORG, ...memberVisibility, isArchived: false });
      expect(prisma.project.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where,
        orderBy: [{ reportedDate: { sort: 'desc', nulls: 'last' } }, { id: 'asc' }],
      }));
      expect(prisma.project.count).toHaveBeenCalledWith({ where });
      expect(prisma.project.groupBy).toHaveBeenCalledWith({ by: ['clientId'], where, _count: { _all: true } });
      // Totals only for clients on this page; the client count covers every match.
      expect(result.meta).toEqual({ total: 3, page: 1, limit: 25, lastPage: 1, clientCount: 2, clientTotals: [{ clientId: 'client-1', count: 2 }] });
    });

    it('skips client totals unless asked for', async () => {
      const result = await projects.getAllProjects({ page: 1, limit: 25 }, ORG, MEMBER_USER);
      expect(prisma.project.groupBy).not.toHaveBeenCalled();
      expect(result.meta).toEqual({ total: 0, page: 1, limit: 25, lastPage: 0 });
    });
  });
});
