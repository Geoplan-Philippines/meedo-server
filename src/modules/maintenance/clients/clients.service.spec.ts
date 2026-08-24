import { Test, TestingModule } from '@nestjs/testing';
import { HttpException } from '@nestjs/common';
import { PrismaService } from '../../../core/database/prisma.service';
import { ClientsService } from './clients.service';

const mockClient = {
  id: 'client-uuid-1',
  apptivoId: '21463370742',
  customerName: 'Orica Philippines Inc.',
  organizationId: 'org-uuid-1',
  createdAt: new Date(),
  updatedAt: new Date(),
  _count: { projects: 0 },
};

const mockPrismaService = {
  client: {
    findMany: jest.fn(),
    count: jest.fn(),
    upsert: jest.fn(),
    deleteMany: jest.fn(),
  },
  $transaction: jest.fn(),
};

global.fetch = jest.fn();

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
  });

  describe('getAllClients', () => {
    it('returns paginated clients with project count', async () => {
      mockPrismaService.client.findMany.mockResolvedValue([mockClient]);
      mockPrismaService.client.count.mockResolvedValue(1);

      const result = await service.getAllClients({ page: 1, limit: 10 }, 'org-uuid-1');

      expect(result.data).toEqual([mockClient]);
      expect(result.data[0]._count.projects).toBe(0);
      expect(result.meta.total).toBe(1);
      expect(result.meta.lastPage).toBe(1);
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
  });

  describe('syncClientsFromApptivo', () => {
    const mockCustomers = [
      {
        customerId: '21463370742',
        customerName: 'Orica Philippines Inc.',
      },
    ];

    it('syncs clients and returns synced and deleted counts', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({ data: mockCustomers }),
      });

      mockPrismaService.client.upsert.mockResolvedValue(mockClient);
      mockPrismaService.$transaction.mockResolvedValue([mockClient, { count: 0 }]);

      const result = await service.syncClientsFromApptivo('org-uuid-1');

      expect(result.synced).toBe(1);
      expect(result.deleted).toBe(0);
    });

    it('upserts client with correct data using org-scoped key', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({ data: mockCustomers }),
      });

      mockPrismaService.$transaction.mockResolvedValue([mockClient, { count: 0 }]);

      await service.syncClientsFromApptivo('org-uuid-1');

      expect(mockPrismaService.client.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { organizationId_apptivoId: { organizationId: 'org-uuid-1', apptivoId: '21463370742' } },
          update: { customerName: 'Orica Philippines Inc.' },
          create: expect.objectContaining({
            apptivoId: '21463370742',
            customerName: 'Orica Philippines Inc.',
          }),
        }),
      );
    });

    it('skips customers missing customerId or with empty/whitespace customerId', async () => {
      const customersWithInvalid = [
        { customerId: '21463370742', customerName: 'Valid Client' },
        { customerName: 'No ID Client' },
        { customerId: '', customerName: 'Empty ID Client' },
        { customerId: '   ', customerName: 'Whitespace ID Client' },
      ];

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({ data: customersWithInvalid }),
      });

      mockPrismaService.$transaction.mockResolvedValue([mockClient, { count: 0 }]);

      const result = await service.syncClientsFromApptivo('org-uuid-1');

      expect(result.synced).toBe(1);
      expect(mockPrismaService.client.upsert).toHaveBeenCalledTimes(1);
    });

    it('returns early without purging when no valid customers', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({ data: [] }),
      });

      const result = await service.syncClientsFromApptivo('org-uuid-1');

      expect(result).toEqual({ synced: 0, deleted: 0 });
      expect(mockPrismaService.$transaction).not.toHaveBeenCalled();
    });

    it('purges stale clients with correct notIn list', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({ data: mockCustomers }),
      });

      mockPrismaService.$transaction.mockResolvedValue([mockClient, { count: 2 }]);

      const result = await service.syncClientsFromApptivo('org-uuid-1');

      expect(mockPrismaService.client.deleteMany).toHaveBeenCalledWith({
        where: { organizationId: 'org-uuid-1', apptivoId: { notIn: ['21463370742'] } },
      });
      expect(result.deleted).toBe(2);
    });

    it('fetches multiple pages when batch is full', async () => {
      const firstBatch = Array.from({ length: 500 }, (_, i) => ({
        customerId: String(i + 1),
        customerName: `Client ${i + 1}`,
      }));
      const secondBatch = [{ customerId: '501', customerName: 'Client 501' }];

      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: jest.fn().mockResolvedValue({ data: firstBatch }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: jest.fn().mockResolvedValue({ data: secondBatch }),
        });

      mockPrismaService.$transaction.mockResolvedValue([...firstBatch, mockClient, { count: 0 }]);

      const result = await service.syncClientsFromApptivo('org-uuid-1');

      expect(global.fetch).toHaveBeenCalledTimes(2);
      expect(result.synced).toBe(501);
    });

    it('stops fetching when batch is smaller than batch size', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({ data: mockCustomers }),
      });

      mockPrismaService.$transaction.mockResolvedValue([mockClient, { count: 0 }]);

      await service.syncClientsFromApptivo('org-uuid-1');

      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it('throws HttpException when fetch fails', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({ ok: false });

      await expect(service.syncClientsFromApptivo('org-uuid-1')).rejects.toThrow(HttpException);
    });

    it('throws HttpException on network error', async () => {
      (global.fetch as jest.Mock).mockRejectedValue(new Error('Network error'));

      await expect(service.syncClientsFromApptivo('org-uuid-1')).rejects.toThrow(HttpException);
    });

    it('throws HttpException when response is not an array', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({ data: 'not-an-array' }),
      });

      mockPrismaService.$transaction.mockResolvedValue([mockClient, { count: 0 }]);

      await expect(service.syncClientsFromApptivo('org-uuid-1')).rejects.toThrow(HttpException);
    });

    it('throws HttpException when max iterations cap is hit and does not purge', async () => {
      const fullBatch = Array.from({ length: 500 }, (_, i) => ({
        customerId: String(i + 1),
        customerName: `Client ${i + 1}`,
      }));

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({ data: fullBatch }),
      });

      await expect(service.syncClientsFromApptivo('org-uuid-1')).rejects.toThrow(
        'Apptivo customer fetch exceeded maximum page limit — sync aborted to prevent partial purge',
      );

      expect(global.fetch).toHaveBeenCalledTimes(20);
      expect(mockPrismaService.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('getClientMap', () => {
    it('returns a map of apptivoId to db id', async () => {
      mockPrismaService.client.findMany.mockResolvedValue([
        { id: 'db-uuid-1', apptivoId: 'apptivo-1' },
        { id: 'db-uuid-2', apptivoId: 'apptivo-2' },
      ]);

      const result = await service.getClientMap('org-uuid-1', ['apptivo-1', 'apptivo-2']);

      expect(result.get('apptivo-1')).toBe('db-uuid-1');
      expect(result.get('apptivo-2')).toBe('db-uuid-2');
    });

    it('returns empty map when no clients found', async () => {
      mockPrismaService.client.findMany.mockResolvedValue([]);

      const result = await service.getClientMap('org-uuid-1', ['apptivo-1']);

      expect(result.size).toBe(0);
    });
  });
});
