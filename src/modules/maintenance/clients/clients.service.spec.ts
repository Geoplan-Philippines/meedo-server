import { Test, TestingModule } from '@nestjs/testing';
import { HttpException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../core/database/prisma.service';
import { ClientsService } from './clients.service';
import { plainToInstance } from 'class-transformer';
import { GetClientTreeQueryDTO } from './dto/get-client-tree-query.dto';
import { FakeApptivoSyncPrisma } from '../../../../test/fakes/apptivo-sync-prisma.fake';
import { env } from '../../../core/config/env.config';

const mockClient = {
  id: 'client-uuid-1',
  apptivoId: '21463370742',
  customerName: 'Orica Philippines Inc.',
  displayName: null,
  organizationId: 'org-uuid-1',
  isArchived: false,
  archivedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  _count: { projects: 0 },
};

const mockPrismaService = {
  client: {
    findMany: jest.fn(),
    count: jest.fn(),
  },
  project: {
    groupBy: jest.fn(),
  },
  $queryRaw: jest.fn(),
};

global.fetch = jest.fn();

const mockCustomersResponse = (customers: unknown[]) =>
  (global.fetch as jest.Mock).mockResolvedValue({
    ok: true,
    json: jest.fn().mockResolvedValue({ data: customers }),
  });

describe('ClientsService', () => {
  let service: ClientsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ClientsService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<ClientsService>(ClientsService);
    jest.resetAllMocks();
    mockPrismaService.project.groupBy.mockResolvedValue([]);
  });

  describe('getAllClients', () => {
    it('returns paginated clients with project count', async () => {
      mockPrismaService.client.findMany.mockResolvedValue([mockClient]);
      mockPrismaService.client.count.mockResolvedValue(1);

      const result = await service.getAllClients({ page: 1, limit: 10 }, 'org-uuid-1');

      expect(result.data).toEqual([
        { ...mockClient, name: 'Orica Philippines Inc.', projectCount: 0, activeProjectCount: 0 },
      ]);
      expect(result.data[0]._count.projects).toBe(0);
      expect(result.meta.total).toBe(1);
      expect(result.meta.lastPage).toBe(1);
    });

    it('names clients by displayName when set and reports total and active project counts', async () => {
      mockPrismaService.client.findMany.mockResolvedValue([{ ...mockClient, displayName: 'Orica', _count: { projects: 5 } }]);
      mockPrismaService.client.count.mockResolvedValue(1);
      mockPrismaService.project.groupBy.mockResolvedValue([{ clientId: mockClient.id, _count: { _all: 3 } }]);

      const { data } = await service.getAllClients({ page: 1, limit: 10 }, 'org-uuid-1');

      expect(data[0]).toMatchObject({ name: 'Orica', projectCount: 5, activeProjectCount: 3 });
    });

    it('searches display and customer name and sorts by project count', async () => {
      mockPrismaService.client.findMany.mockResolvedValue([]);
      mockPrismaService.client.count.mockResolvedValue(0);

      await service.getAllClients(
        { page: 1, limit: 10, search: 'orica', sortField: 'projectCount', sortOrder: 'desc' },
        'org-uuid-1',
      );

      expect(mockPrismaService.client.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            organizationId: 'org-uuid-1',
            isArchived: false,
            OR: [
              { displayName: { contains: 'orica', mode: 'insensitive' } },
              { customerName: { contains: 'orica', mode: 'insensitive' } },
            ],
          },
          orderBy: [{ projects: { _count: 'desc' } }, { id: 'asc' }],
        }),
      );
    });

    it('calculates lastPage correctly', async () => {
      mockPrismaService.client.findMany.mockResolvedValue([]);
      mockPrismaService.client.count.mockResolvedValue(25);

      const result = await service.getAllClients({ page: 1, limit: 10 }, 'org-uuid-1');

      expect(result.meta.lastPage).toBe(3);
    });

    it('skips correct number of records based on page', async () => {
      mockPrismaService.client.findMany.mockResolvedValue([]);
      mockPrismaService.client.count.mockResolvedValue(0);

      await service.getAllClients({ page: 3, limit: 10 }, 'org-uuid-1');

      expect(mockPrismaService.client.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 20, take: 10, include: { _count: { select: { projects: true } } } }),
      );
    });

    it('excludes archived clients by default', async () => {
      mockPrismaService.client.findMany.mockResolvedValue([]);
      mockPrismaService.client.count.mockResolvedValue(0);

      await service.getAllClients({ page: 1, limit: 10 }, 'org-uuid-1');

      const where = { organizationId: 'org-uuid-1', isArchived: false };
      expect(mockPrismaService.client.findMany).toHaveBeenCalledWith(expect.objectContaining({ where }));
      expect(mockPrismaService.client.count).toHaveBeenCalledWith({ where });
    });

    it('includes archived clients when includeArchived is true', async () => {
      mockPrismaService.client.findMany.mockResolvedValue([]);
      mockPrismaService.client.count.mockResolvedValue(0);

      await service.getAllClients({ page: 1, limit: 10, includeArchived: true }, 'org-uuid-1');

      expect(mockPrismaService.client.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { organizationId: 'org-uuid-1' } }),
      );
    });
  });

  describe('syncClientsFromApptivo', () => {
    const ORG = 'org-uuid-1';
    let fake: FakeApptivoSyncPrisma;
    let syncService: ClientsService;

    beforeEach(async () => {
      fake = new FakeApptivoSyncPrisma();
      const module = await Test.createTestingModule({
        providers: [ClientsService, { provide: PrismaService, useValue: fake }],
      }).compile();
      syncService = module.get(ClientsService);
    });

    afterEach(() => {
      expect(fake.client.delete).not.toHaveBeenCalled();
      expect(fake.client.deleteMany).not.toHaveBeenCalled();
    });

    it('creates new clients and returns created/updated/archived/unarchived counts', async () => {
      mockCustomersResponse([{ customerId: '21463370742', customerName: 'Orica Philippines Inc.' }]);

      const result = await syncService.syncClientsFromApptivo(ORG);

      expect(result).toEqual({ synced: 1, created: 1, updated: 0, archived: 0, unarchived: 0 });
      expect(fake.clientByApptivoId(ORG, '21463370742')).toMatchObject({
        customerName: 'Orica Philippines Inc.',
        isArchived: false,
      });
      expect(fake.$transaction).toHaveBeenCalledTimes(1);
    });

    it('keeps the same row and updates customerName when a customer is renamed', async () => {
      const [existing] = fake.client.seed([{ organizationId: ORG, apptivoId: 'c-1', customerName: 'Old Name Inc.' }]);
      mockCustomersResponse([{ customerId: 'c-1', customerName: 'New Name Inc.' }]);

      const result = await syncService.syncClientsFromApptivo(ORG);

      expect(result).toEqual({ synced: 1, created: 0, updated: 1, archived: 0, unarchived: 0 });
      expect(fake.client.rows).toHaveLength(1);
      expect(fake.clientByApptivoId(ORG, 'c-1')).toMatchObject({ id: existing.id, customerName: 'New Name Inc.' });
    });

    it('allows two customers with the same name under different apptivoIds', async () => {
      mockCustomersResponse([
        { customerId: 'c-1', customerName: 'Acme' },
        { customerId: 'c-2', customerName: 'Acme' },
      ]);

      const result = await syncService.syncClientsFromApptivo(ORG);

      expect(result.created).toBe(2);
    });

    it('archives clients missing from Apptivo instead of deleting them', async () => {
      fake.client.seed([
        { organizationId: ORG, apptivoId: 'c-1', customerName: 'Kept' },
        { organizationId: ORG, apptivoId: 'c-gone', customerName: 'Gone' },
        { organizationId: 'other-org', apptivoId: 'c-other', customerName: 'Other org' },
      ]);
      mockCustomersResponse([{ customerId: 'c-1', customerName: 'Kept' }]);

      const result = await syncService.syncClientsFromApptivo(ORG);

      expect(result).toEqual({ synced: 1, created: 0, updated: 0, archived: 1, unarchived: 0 });
      expect(fake.clientByApptivoId(ORG, 'c-gone')).toMatchObject({ isArchived: true, archivedAt: expect.any(Date) as Date });
      expect(fake.clientByApptivoId('other-org', 'c-other')).toMatchObject({ isArchived: false });
      expect(fake.client.rows).toHaveLength(3);
    });

    it('un-archives a client that reappears', async () => {
      fake.client.seed([
        { organizationId: ORG, apptivoId: 'c-1', customerName: 'Back', isArchived: true, archivedAt: new Date() },
      ]);
      mockCustomersResponse([{ customerId: 'c-1', customerName: 'Back' }]);

      const result = await syncService.syncClientsFromApptivo(ORG);

      expect(result).toEqual({ synced: 1, created: 0, updated: 0, archived: 0, unarchived: 1 });
      expect(fake.clientByApptivoId(ORG, 'c-1')).toMatchObject({ isArchived: false, archivedAt: null });
    });

    it('does not write unchanged active clients', async () => {
      fake.client.seed([{ organizationId: ORG, apptivoId: 'c-1', customerName: 'Same' }]);
      mockCustomersResponse([{ customerId: 'c-1', customerName: 'Same' }]);

      const result = await syncService.syncClientsFromApptivo(ORG);

      expect(result).toEqual({ synced: 1, created: 0, updated: 0, archived: 0, unarchived: 0 });
      expect(fake.client.update).not.toHaveBeenCalled();
    });

    it('skips customers missing customerId or with empty/whitespace customerId', async () => {
      mockCustomersResponse([
        { customerId: '21463370742', customerName: 'Valid Client' },
        { customerName: 'No ID Client' },
        { customerId: '', customerName: 'Empty ID Client' },
        { customerId: '   ', customerName: 'Whitespace ID Client' },
      ]);

      const result = await syncService.syncClientsFromApptivo(ORG);

      expect(result.synced).toBe(1);
      expect(fake.client.rows).toHaveLength(1);
    });

    it('keeps an existing client name and active state when Apptivo sends a blank name', async () => {
      fake.client.seed([{ organizationId: ORG, apptivoId: 'c-1', customerName: 'Known' }]);
      mockCustomersResponse([
        { customerId: 'c-1', customerName: '  ' },
        { customerId: 'c-new', customerName: '' },
      ]);

      const result = await syncService.syncClientsFromApptivo(ORG);

      expect(result).toMatchObject({ created: 0, updated: 0, archived: 0 });
      expect(fake.clientByApptivoId(ORG, 'c-1')).toMatchObject({ customerName: 'Known', isArchived: false });
    });

    it('does not archive anything when Apptivo returns no customers', async () => {
      fake.client.seed([{ organizationId: ORG, apptivoId: 'c-1', customerName: 'Kept' }]);
      mockCustomersResponse([]);

      const result = await syncService.syncClientsFromApptivo(ORG);

      expect(result).toEqual({ synced: 0, created: 0, updated: 0, archived: 0, unarchived: 0 });
      expect(fake.clientByApptivoId(ORG, 'c-1')).toMatchObject({ isArchived: false });
    });

    it('rolls back every client change when a write fails', async () => {
      fake.client.seed([
        { organizationId: ORG, apptivoId: 'c-1', customerName: 'Old Name' },
        { organizationId: ORG, apptivoId: 'c-gone', customerName: 'Gone' },
      ]);
      mockCustomersResponse([
        { customerId: 'c-1', customerName: 'New Name' },
        { customerId: 'c-new', customerName: 'New Client' },
      ]);
      fake.client.updateMany.mockRejectedValueOnce(new Error('db down'));

      await expect(syncService.syncClientsFromApptivo(ORG)).rejects.toThrow('db down');

      expect(fake.client.rows).toHaveLength(2);
      expect(fake.clientByApptivoId(ORG, 'c-1')).toMatchObject({ customerName: 'Old Name' });
      expect(fake.clientByApptivoId(ORG, 'c-gone')).toMatchObject({ isArchived: false });
    });

    it('fetches multiple pages when batch is full', async () => {
      const firstBatch = Array.from({ length: 500 }, (_, i) => ({
        customerId: String(i + 1),
        customerName: `Client ${i + 1}`,
      }));
      const secondBatch = [{ customerId: '501', customerName: 'Client 501' }];

      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({ ok: true, json: jest.fn().mockResolvedValue({ data: firstBatch }) })
        .mockResolvedValueOnce({ ok: true, json: jest.fn().mockResolvedValue({ data: secondBatch }) });

      const result = await syncService.syncClientsFromApptivo(ORG);

      expect(global.fetch).toHaveBeenCalledTimes(2);
      expect(result.synced).toBe(501);
    });

    it('stops fetching when batch is smaller than batch size', async () => {
      mockCustomersResponse([{ customerId: 'c-1', customerName: 'Only' }]);

      await syncService.syncClientsFromApptivo(ORG);

      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it('throws HttpException when fetch fails', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({ ok: false });

      await expect(syncService.syncClientsFromApptivo(ORG)).rejects.toThrow(HttpException);
    });

    it('throws HttpException on network error', async () => {
      (global.fetch as jest.Mock).mockRejectedValue(new Error('Network error'));

      await expect(syncService.syncClientsFromApptivo(ORG)).rejects.toThrow(HttpException);
    });

    it('throws HttpException when response is not an array', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({ data: 'not-an-array' }),
      });

      await expect(syncService.syncClientsFromApptivo(ORG)).rejects.toThrow(HttpException);
    });

    it('throws HttpException when the page cap is hit with records remaining and writes nothing', async () => {
      const fullBatch = Array.from({ length: 500 }, (_, i) => ({
        customerId: String(i + 1),
        customerName: `Client ${i + 1}`,
      }));
      mockCustomersResponse(fullBatch);

      await expect(syncService.syncClientsFromApptivo(ORG)).rejects.toThrow(
        `Apptivo customers fetch hit the ${env.APPTIVO_SYNC_MAX_PAGES}-page cap`,
      );

      expect(global.fetch).toHaveBeenCalledTimes(env.APPTIVO_SYNC_MAX_PAGES);
      expect(fake.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('getClientTree', () => {
    const sqlValues = (call: unknown[]) => (call[0] as Prisma.Sql).values;

    it.each([['true', false], ['false', true], [undefined, true]])(
      'supports the opt-in active-project filter (%s) in both rows and pagination',
      async (value, allowEmptyClients) => {
        mockPrismaService.$queryRaw.mockResolvedValue([{ count: BigInt(0) }]);
        const query = plainToInstance(GetClientTreeQueryDTO, { page: 1, limit: 8, hasActiveProjects: value });
        await service.getClientTree(query, 'org-uuid-1');

        const calls = mockPrismaService.$queryRaw.mock.calls as [Prisma.Sql][];
        for (const [sql] of calls.slice(0, 2)) {
          // The opt-in must apply before LIMIT and to the total, including without a team filter.
          const havingIndex = sql.strings.findIndex((part) => part.includes('HAVING'));
          expect(sql.values[havingIndex]).toBeNull();
          expect(sql.values[havingIndex + 1]).toBe(allowEmptyClients);
        }
      },
    );

    it('maps rows, paginates and reports unassigned projects', async () => {
      mockPrismaService.$queryRaw
        .mockResolvedValueOnce([{ id: 'c1', name: 'KDDI Philippines Corp.', project_count: 3 }])
        .mockResolvedValueOnce([{ count: BigInt(51) }])
        .mockResolvedValueOnce([{ count: BigInt(2) }]);

      const result = await service.getClientTree({ page: 1, limit: 50 }, 'org-uuid-1');

      expect(result).toEqual({
        data: [{ id: 'c1', name: 'KDDI Philippines Corp.', projectCount: 3 }],
        meta: { total: 51, page: 1, limit: 50, lastPage: 2, unassignedProjectCount: 2 },
      });
    });

    it('passes the trimmed search and the Dept (team) to every query', async () => {
      mockPrismaService.$queryRaw.mockResolvedValue([{ count: BigInt(0) }]);

      await service.getClientTree({ page: 2, limit: 20, search: ' kddi ', teamId: 'team-1' }, 'org-uuid-1');

      const calls = mockPrismaService.$queryRaw.mock.calls as unknown[][];
      for (const call of calls) {
        expect(sqlValues(call)).toEqual(expect.arrayContaining(['org-uuid-1', 'team-1']));
      }
      expect(sqlValues(calls[0])).toEqual(expect.arrayContaining(['kddi', 20, 20]));
    });
  });

  describe('getClientMap', () => {
    it('returns a map of apptivoId to db id and customer name', async () => {
      mockPrismaService.client.findMany.mockResolvedValue([
        { id: 'db-uuid-1', apptivoId: 'apptivo-1', customerName: 'Clark PH' },
        { id: 'db-uuid-2', apptivoId: 'apptivo-2', customerName: 'Denso PH' },
      ]);

      const result = await service.getClientMap('org-uuid-1', ['apptivo-1', 'apptivo-2']);

      expect(result.get('apptivo-1')).toEqual({ id: 'db-uuid-1', customerName: 'Clark PH' });
      expect(result.get('apptivo-2')).toEqual({ id: 'db-uuid-2', customerName: 'Denso PH' });
    });

    it('returns empty map when no clients found', async () => {
      mockPrismaService.client.findMany.mockResolvedValue([]);

      const result = await service.getClientMap('org-uuid-1', ['apptivo-1']);

      expect(result.size).toBe(0);
    });
  });
});
