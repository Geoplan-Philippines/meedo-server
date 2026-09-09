import { Test, TestingModule } from '@nestjs/testing';
import { HttpException } from '@nestjs/common';
import { PrismaService } from '../../../core/database/prisma.service';
import { WorkOrdersService } from './work-orders.service';
import { ClientsService } from '../clients/clients.service';

const mockWorkOrder = {
  id: '111222333',
  workOrderNumber: 'IO-2026-1111',
  status: 'active',
  total: 1000,
  reportedDate: null,
  isArchived: false,
  archivedAt: null,
  apptivoId: 'apptivo-123',
  organizationId: 'org-geo',
  clientId: null,
  client: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockPrismaService = {
  workOrder: {
    findMany: jest.fn(),
    count: jest.fn(),
    upsert: jest.fn(),
    updateMany: jest.fn(),
  },
  $transaction: jest.fn(),
};

const mockClientsService = {
  getClientMap: jest.fn(),
  syncClientsFromApptivo: jest.fn(),
};

global.fetch = jest.fn();

describe('WorkOrdersService', () => {
  let service: WorkOrdersService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorkOrdersService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: ClientsService, useValue: mockClientsService },
      ],
    }).compile();

    service = module.get<WorkOrdersService>(WorkOrdersService);
    jest.resetAllMocks();
  });

  describe('getAllWorkOrders', () => {
    it('returns paginated work orders', async () => {
      mockPrismaService.workOrder.findMany.mockResolvedValue([mockWorkOrder]);
      mockPrismaService.workOrder.count.mockResolvedValue(1);

      const result = await service.getAllWorkOrders({ page: 1, limit: 10 }, 'org-uuid-1');

      expect(result.data).toEqual([mockWorkOrder]);
      expect(result.meta.total).toBe(1);
      expect(result.meta.lastPage).toBe(1);
    });

    it('calculates lastPage correctly', async () => {
      mockPrismaService.workOrder.findMany.mockResolvedValue([]);
      mockPrismaService.workOrder.count.mockResolvedValue(25);

      const result = await service.getAllWorkOrders({ page: 1, limit: 10 }, 'org-uuid-1');

      expect(result.meta.lastPage).toBe(3);
    });

    it('skips correct number of records based on page', async () => {
      mockPrismaService.workOrder.findMany.mockResolvedValue([]);
      mockPrismaService.workOrder.count.mockResolvedValue(0);

      await service.getAllWorkOrders({ page: 3, limit: 10 }, 'org-uuid-1');

      expect(mockPrismaService.workOrder.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 20, take: 10 }),
      );
    });

    it('filters by clientId when provided', async () => {
      mockPrismaService.workOrder.findMany.mockResolvedValue([]);
      mockPrismaService.workOrder.count.mockResolvedValue(0);

      await service.getAllWorkOrders({ page: 1, limit: 10, clientId: 'client-uuid-1' }, 'org-uuid-1');

      const expectedWhere = {
        organizationId: 'org-uuid-1',
        clientId: 'client-uuid-1',
        isArchived: false,
      };

      expect(mockPrismaService.workOrder.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expectedWhere }),
      );
      expect(mockPrismaService.workOrder.count).toHaveBeenCalledWith(
        expect.objectContaining({ where: expectedWhere }),
      );
    });

    it('hides archived work orders by default', async () => {
      mockPrismaService.workOrder.findMany.mockResolvedValue([]);
      mockPrismaService.workOrder.count.mockResolvedValue(0);

      await service.getAllWorkOrders({ page: 1, limit: 10 }, 'org-uuid-1');

      expect(mockPrismaService.workOrder.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { organizationId: 'org-uuid-1', isArchived: false },
        }),
      );
    });

    it('includes archived work orders when asked', async () => {
      mockPrismaService.workOrder.findMany.mockResolvedValue([]);
      mockPrismaService.workOrder.count.mockResolvedValue(0);

      await service.getAllWorkOrders({ page: 1, limit: 10, includeArchived: true }, 'org-uuid-1');

      expect(mockPrismaService.workOrder.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { organizationId: 'org-uuid-1' } }),
      );
    });
  });

  describe('syncWorkOrdersFromApptivo', () => {
    const mockApptivoWorkOrders = [
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
      mockClientsService.getClientMap.mockResolvedValue(new Map([['client-apptivo-1', 'client-db-1']]));
      mockClientsService.syncClientsFromApptivo.mockResolvedValue({ synced: 0, deleted: 0 });
      mockPrismaService.workOrder.count.mockResolvedValue(0);
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

      mockPrismaService.$transaction.mockResolvedValue([mockWorkOrder, { count: 0 }]);

      await service.syncWorkOrdersFromApptivo('org-geo');

      expect(mockPrismaService.workOrder.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            workOrderNumber: 'IO-2026-1111',
            status: 'active',
            total: 1000,
            reportedDate: new Date('2026-01-01'),
          }),
        }),
      );
    });

    it('syncs work orders and reports counts', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({ data: mockApptivoWorkOrders }),
      });

      mockPrismaService.workOrder.upsert.mockResolvedValue(mockWorkOrder);
      mockPrismaService.$transaction.mockResolvedValue([mockWorkOrder, { count: 0 }]);

      const result = await service.syncWorkOrdersFromApptivo('org-uuid-1');

      expect(result).toEqual({ synced: 1, skipped: 0, archived: 0, restored: 0 });
      expect(mockClientsService.syncClientsFromApptivo).toHaveBeenCalledWith('org-uuid-1');
    });

    it('resolves clientId from clientMap and clears any prior archive', async () => {
      mockClientsService.getClientMap.mockResolvedValue(new Map([['client-apptivo-1', 'db-client-uuid-1']]));

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({ data: mockApptivoWorkOrders }),
      });

      mockPrismaService.$transaction.mockResolvedValue([mockWorkOrder, { count: 0 }]);

      await service.syncWorkOrdersFromApptivo('org-uuid-1');

      expect(mockPrismaService.workOrder.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: expect.objectContaining({
            clientId: 'db-client-uuid-1',
            isArchived: false,
            archivedAt: null,
          }),
        }),
      );
    });

    it('archives instead of deleting work orders missing from the feed', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({ data: mockApptivoWorkOrders }),
      });

      mockPrismaService.$transaction.mockResolvedValue([mockWorkOrder, { count: 2 }]);

      const result = await service.syncWorkOrdersFromApptivo('org-uuid-1');

      expect(mockPrismaService.workOrder.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            organizationId: 'org-uuid-1',
            apptivoId: { notIn: ['apptivo-1'] },
            isArchived: false,
          }),
          data: expect.objectContaining({ isArchived: true }),
        }),
      );
      expect(result.archived).toBe(2);
    });

    it('skips upsert but still protects work orders whose client is unresolved', async () => {
      mockClientsService.getClientMap.mockResolvedValue(new Map());

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({ data: mockApptivoWorkOrders }),
      });

      mockPrismaService.$transaction.mockResolvedValue([{ count: 0 }]);

      const result = await service.syncWorkOrdersFromApptivo('org-uuid-1');

      expect(mockPrismaService.workOrder.upsert).not.toHaveBeenCalled();
      expect(result.skipped).toBe(1);

      // The unlinkable work order must stay in the keep-list, otherwise a
      // transient client-map miss would archive a live work order.
      expect(mockPrismaService.workOrder.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ apptivoId: { notIn: ['apptivo-1'] } }),
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

    it('returns early without reconciling when the feed is empty', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({ data: [] }),
      });

      const result = await service.syncWorkOrdersFromApptivo('org-uuid-1');

      expect(result).toEqual({ synced: 0, skipped: 0, archived: 0, restored: 0 });
      expect(mockPrismaService.$transaction).not.toHaveBeenCalled();
    });
  });
});
