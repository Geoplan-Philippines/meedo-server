import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { StatusesService } from './statuses.service';
import { PrismaService } from '../../../core/database/prisma.service';
import { SYSTEM_STATUSES } from '../../../common/constants/statuses.constants';

const mockStatus = {
  id: 'status-uuid-1',
  name: 'Open',
  color: '#6B7280',
  category: 'BACKLOG',
  isArchived: false,
  isSystem: false,
  organizationId: 'org-geo',
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockPrismaService = {
  ticketStatus: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
  },
  $transaction: jest.fn(),
};

/** Builds a mock interactive-transaction client for ensureSystemStatuses. */
const makeTxClient = () => ({
  ticketStatus: {
    findUnique: jest.fn().mockResolvedValue(null),
    updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    upsert: jest.fn().mockResolvedValue({}),
  },
});

describe('StatusesService', () => {
  let service: StatusesService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StatusesService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<StatusesService>(StatusesService);
    jest.resetAllMocks();
  });

  describe('createStatus', () => {
    const dto = { name: 'Open', color: '#6B7280' };

    it('creates and returns a status', async () => {
      mockPrismaService.ticketStatus.create.mockResolvedValue(mockStatus);

      const result = await service.createStatus(dto, 'org-geo');

      expect(mockPrismaService.ticketStatus.create).toHaveBeenCalledWith({
        data: {
          name: dto.name,
          color: dto.color,
          category: undefined,
          organization: { connect: { id: 'org-geo' } },
        },
      });
      expect(result).toEqual(mockStatus);
    });
  });

  describe('updateStatus', () => {
    it('propagates error when status belongs to a different org', async () => {
      // assertNotSystem scopes findFirst by (id, organizationId); a wrong-org id
      // resolves to null and surfaces a NotFoundException before any update.
      mockPrismaService.ticketStatus.findFirst.mockResolvedValue(null);

      await expect(
        service.updateStatus('status-uuid-1', { name: 'Closed' }, 'different-org'),
      ).rejects.toThrow(NotFoundException);
      expect(mockPrismaService.ticketStatus.update).not.toHaveBeenCalled();
    });

    it('rejects edits to system statuses', async () => {
      mockPrismaService.ticketStatus.findFirst.mockResolvedValue({ isSystem: true });

      await expect(
        service.updateStatus('status-uuid-1', { name: 'Closed' }, 'org-geo'),
      ).rejects.toThrow(BadRequestException);
      expect(mockPrismaService.ticketStatus.update).not.toHaveBeenCalled();
    });

    it('updates and returns the status', async () => {
      mockPrismaService.ticketStatus.findFirst.mockResolvedValue({ isSystem: false });
      const updated = { ...mockStatus, name: 'Closed' };
      mockPrismaService.ticketStatus.update.mockResolvedValue(updated);

      const result = await service.updateStatus('status-uuid-1', { name: 'Closed' }, 'org-geo');

      expect(mockPrismaService.ticketStatus.update).toHaveBeenCalledWith({
        where: { id: 'status-uuid-1', organizationId: 'org-geo' },
        data: { name: 'Closed' },
      });
      expect(result.name).toBe('Closed');
    });
  });

  describe('archiveStatus', () => {
    it('rejects archiving system statuses', async () => {
      mockPrismaService.ticketStatus.findFirst.mockResolvedValue({ isSystem: true });

      await expect(service.archiveStatus('status-uuid-1', 'org-geo')).rejects.toThrow(
        BadRequestException,
      );
      expect(mockPrismaService.ticketStatus.update).not.toHaveBeenCalled();
    });

    it('sets isArchived to true', async () => {
      mockPrismaService.ticketStatus.findFirst.mockResolvedValue({ isSystem: false });
      const archived = { ...mockStatus, isArchived: true };
      mockPrismaService.ticketStatus.update.mockResolvedValue(archived);

      const result = await service.archiveStatus('status-uuid-1', 'org-geo');

      expect(mockPrismaService.ticketStatus.update).toHaveBeenCalledWith({
        where: { id: 'status-uuid-1', organizationId: 'org-geo' },
        data: { isArchived: true },
      });
      expect(result.isArchived).toBe(true);
    });
  });

  describe('restoreStatus', () => {
    it('rejects restoring system statuses', async () => {
      mockPrismaService.ticketStatus.findFirst.mockResolvedValue({ isSystem: true });

      await expect(service.restoreStatus('status-uuid-1', 'org-geo')).rejects.toThrow(
        BadRequestException,
      );
      expect(mockPrismaService.ticketStatus.update).not.toHaveBeenCalled();
    });

    it('sets isArchived to false', async () => {
      mockPrismaService.ticketStatus.findFirst.mockResolvedValue({ isSystem: false });
      const restored = { ...mockStatus, isArchived: false };
      mockPrismaService.ticketStatus.update.mockResolvedValue(restored);

      const result = await service.restoreStatus('status-uuid-1', 'org-geo');

      expect(mockPrismaService.ticketStatus.update).toHaveBeenCalledWith({
        where: { id: 'status-uuid-1', organizationId: 'org-geo' },
        data: { isArchived: false },
      });
      expect(result.isArchived).toBe(false);
    });
  });

  describe('getStatusesByOrganization', () => {
    it('seeds missing system statuses, then returns them in canonical order', async () => {
      mockPrismaService.ticketStatus.count.mockResolvedValue(0);
      mockPrismaService.$transaction.mockResolvedValue(undefined);

      const done = { ...mockStatus, id: 's-done', name: 'Done', isSystem: true };
      const backlog = { ...mockStatus, id: 's-backlog', name: 'Backlog', isSystem: true };
      const custom = { ...mockStatus, id: 's-custom', name: 'My Custom', isSystem: false };
      // Deliberately unsorted, with a custom status wedged between system ones.
      mockPrismaService.ticketStatus.findMany.mockResolvedValue([done, custom, backlog]);

      const result = await service.getStatusesByOrganization('org-geo');

      expect(mockPrismaService.ticketStatus.count).toHaveBeenCalledWith({
        where: { organizationId: 'org-geo', isSystem: true },
      });
      expect(mockPrismaService.$transaction).toHaveBeenCalledTimes(1);
      expect(mockPrismaService.ticketStatus.findMany).toHaveBeenCalledWith({
        where: { organizationId: 'org-geo' },
        orderBy: { createdAt: 'asc' },
      });
      // Backlog (rank 0) before Done (rank 4); custom (non-system) sorts last.
      expect(result.map((s) => s.id)).toEqual(['s-backlog', 's-done', 's-custom']);
    });

    it('skips seeding when the full system set already exists', async () => {
      mockPrismaService.ticketStatus.count.mockResolvedValue(SYSTEM_STATUSES.length);
      mockPrismaService.ticketStatus.findMany.mockResolvedValue([]);

      await service.getStatusesByOrganization('org-geo');

      expect(mockPrismaService.$transaction).not.toHaveBeenCalled();
      expect(mockPrismaService.ticketStatus.findMany).toHaveBeenCalledTimes(1);
    });
  });

  describe('ensureSystemStatuses seeding (via getStatusesByOrganization)', () => {
    const runSeeding = async (tx: ReturnType<typeof makeTxClient>) => {
      mockPrismaService.ticketStatus.count.mockResolvedValue(0);
      mockPrismaService.ticketStatus.findMany.mockResolvedValue([]);
      mockPrismaService.$transaction.mockImplementation(
        async (cb: (client: unknown) => Promise<unknown>) => cb(tx),
      );
      await service.getStatusesByOrganization('org-geo');
    };

    it('renames legacy statuses in place and upserts the canonical set without clobbering', async () => {
      const tx = makeTxClient();
      await runSeeding(tx);

      // Legacy names normalized to canonical (preserves the row id / ticket links).
      expect(tx.ticketStatus.updateMany).toHaveBeenCalledWith({
        where: { organizationId: 'org-geo', name: 'Cancelled' },
        data: { name: 'Canceled' },
      });
      expect(tx.ticketStatus.updateMany).toHaveBeenCalledWith({
        where: { organizationId: 'org-geo', name: 'Open' },
        data: { name: 'Todo' },
      });

      // One upsert per canonical status; existing rows are only flagged isSystem —
      // color/category are never overwritten.
      expect(tx.ticketStatus.upsert).toHaveBeenCalledTimes(SYSTEM_STATUSES.length);
      const canceled = SYSTEM_STATUSES.find((s) => s.name === 'Canceled')!;
      expect(tx.ticketStatus.upsert).toHaveBeenCalledWith({
        where: { organizationId_name: { organizationId: 'org-geo', name: 'Canceled' } },
        update: { isSystem: true },
        create: {
          organizationId: 'org-geo',
          name: 'Canceled',
          color: canceled.color,
          category: canceled.category,
          isSystem: true,
        },
      });
    });

    it('skips a legacy rename when the canonical name already exists', async () => {
      const tx = makeTxClient();
      tx.ticketStatus.findUnique.mockResolvedValue({ id: 'existing-canonical' });
      await runSeeding(tx);

      expect(tx.ticketStatus.updateMany).not.toHaveBeenCalled();
      expect(tx.ticketStatus.upsert).toHaveBeenCalledTimes(SYSTEM_STATUSES.length);
    });
  });
});
