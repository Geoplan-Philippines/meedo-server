import { Test, TestingModule } from '@nestjs/testing';
import { HttpException } from '@nestjs/common';
import { PrismaService } from '../../../core/database/prisma.service';
import { ProjectsService } from './projects.service';
import { ClientsService } from '../clients/clients.service';

const mockProject = {
  id: '111222333',
  workOrderNumber: 'IO-2026-1111',
  customerName: 'Clark PH',
  status: 'active',
  total: 1000,
  reportedDate: null,
  apptivoId: 'apptivo-123',
  organizationId: 'org-geo',
  clientId: null,
  client: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockPrismaService = {
  project: {
    findMany: jest.fn(),
    count: jest.fn(),
    upsert: jest.fn(),
    deleteMany: jest.fn(),
  },
  $transaction: jest.fn(),
};

const mockClientsService = {
  getClientMap: jest.fn(),
  syncClientsFromApptivo: jest.fn(),
};

global.fetch = jest.fn();

describe('ProjectsService', () => {
  let service: ProjectsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProjectsService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: ClientsService, useValue: mockClientsService },
      ],
    }).compile();

    service = module.get<ProjectsService>(ProjectsService);
    jest.resetAllMocks();
  });

  describe('getAllProjects', () => {
    it('returns paginated projects', async () => {
      mockPrismaService.project.findMany.mockResolvedValue([mockProject]);
      mockPrismaService.project.count.mockResolvedValue(1);

      const result = await service.getAllProjects({ page: 1, limit: 10 }, 'org-uuid-1');

      expect(result.data).toEqual([mockProject]);
      expect(result.meta.total).toBe(1);
      expect(result.meta.lastPage).toBe(1);
    });

    it('calculates lastPage correctly', async () => {
      mockPrismaService.project.findMany.mockResolvedValue([]);
      mockPrismaService.project.count.mockResolvedValue(25);

      const result = await service.getAllProjects({ page: 1, limit: 10 }, 'org-uuid-1');

      expect(result.meta.lastPage).toBe(3);
    });

    it('skips correct number of records based on page', async () => {
      mockPrismaService.project.findMany.mockResolvedValue([]);
      mockPrismaService.project.count.mockResolvedValue(0);

      await service.getAllProjects({ page: 3, limit: 10 }, 'org-uuid-1');

      expect(mockPrismaService.project.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 20, take: 10 }),
      );
    });
  });

  describe('syncWorkOrdersFromApptivo', () => {
    const mockWorkOrders = [
      {
        id: 'apptivo-1',
        workOrderNumber: 'SO-2026-1111',
        customerName: 'Clark PH',
        customerId: 'client-apptivo-1',
        statusName: 'active',
        total: '1000',
        reportedDate: '2026-01-01',
      },
    ];

    beforeEach(() => {
      mockClientsService.getClientMap.mockResolvedValue(new Map());
      mockClientsService.syncClientsFromApptivo.mockResolvedValue({ synced: 0, deleted: 0 });
    });

    it('normalizes work order data correctly', async () => {
      const rawWorkOrders = [
        {
          id: 'app-123',
          workOrderNumber: 'IO-2026-1111',
          customerName: 'Clark PH',
          customerId: 'client-apptivo-1',
          statusName: 'active',
          total: '1000',
          reportedDate: '2026-01-01',
        },
      ];

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({ data: rawWorkOrders }),
      });

      mockPrismaService.$transaction.mockResolvedValue([mockProject, { count: 0 }]);

      await service.syncWorkOrdersFromApptivo('org-geo');

      expect(mockPrismaService.project.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            workOrderNumber: 'IO-2026-1111',
            customerName: 'Clark PH',
            status: 'active',
            total: 1000,
            reportedDate: new Date('2026-01-01'),
          }),
        }),
      );
    });

    it('syncs work orders and returns synced and deleted counts', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({ data: mockWorkOrders }),
      });

      mockPrismaService.project.upsert.mockResolvedValue(mockProject);
      mockPrismaService.$transaction.mockResolvedValue([mockProject, { count: 0 }]);

      const result = await service.syncWorkOrdersFromApptivo('org-uuid-1');

      expect(result.synced).toBe(1);
      expect(result.deleted).toBe(0);
      expect(mockClientsService.syncClientsFromApptivo).toHaveBeenCalledWith('org-uuid-1');
    });

    it('resolves clientId from clientMap', async () => {
      const clientMap = new Map([['client-apptivo-1', 'db-client-uuid-1']]);
      mockClientsService.getClientMap.mockResolvedValue(clientMap);

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({ data: mockWorkOrders }),
      });

      mockPrismaService.$transaction.mockResolvedValue([mockProject, { count: 0 }]);

      await service.syncWorkOrdersFromApptivo('org-uuid-1');

      expect(mockPrismaService.project.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: expect.objectContaining({ clientId: 'db-client-uuid-1' }),
        }),
      );
    });

    it('sets clientId to null when client not in map', async () => {
      mockClientsService.getClientMap.mockResolvedValue(new Map());

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({ data: mockWorkOrders }),
      });

      mockPrismaService.$transaction.mockResolvedValue([mockProject, { count: 0 }]);

      await service.syncWorkOrdersFromApptivo('org-uuid-1');

      expect(mockPrismaService.project.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: expect.objectContaining({ clientId: null }),
        }),
      );
    });

    it('throws HttpException when fetch fails', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({ ok: false });

      await expect(service.syncWorkOrdersFromApptivo('org-uuid-1')).rejects.toThrow(HttpException);
    });

    it('throws HttpException on network error', async () => {
      (global.fetch as jest.Mock).mockRejectedValue(new Error('Network error'));

      await expect(service.syncWorkOrdersFromApptivo('org-uuid-1')).rejects.toThrow(HttpException);
    });

    it('throws HttpException when response is not an array', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({ data: 'not-an-array' }),
      });

      await expect(service.syncWorkOrdersFromApptivo('org-uuid-1')).rejects.toThrow(HttpException);
    });

    it('returns early without purging when no work orders fetched', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({ data: [] }),
      });

      const result = await service.syncWorkOrdersFromApptivo('org-uuid-1');

      expect(result).toEqual({ synced: 0, deleted: 0 });
      expect(mockPrismaService.$transaction).not.toHaveBeenCalled();
    });
  });
});
