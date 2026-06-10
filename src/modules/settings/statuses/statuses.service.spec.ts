import { Test, TestingModule } from '@nestjs/testing';
import { StatusesService } from './statuses.service';
import { PrismaService } from '../../../core/database/prisma.service';

const mockStatus = {
  id: 'status-uuid-1',
  name: 'Open',
  color: '#6B7280',
  isArchived: false,
  organizationId: 'org-geo',
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockPrismaService = {
  ticketStatus: {
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
};

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
          organization: { connect: { id: 'org-geo' } },
        },
      });
      expect(result).toEqual(mockStatus);
    });
  });
  
  describe('updateStatus', () => {

    it('propagates error when status belongs to a different org', async () => {
      mockPrismaService.ticketStatus.update.mockRejectedValue(new Error('Record not found'));

      await expect(
        service.updateStatus('status-uuid-1', { name: 'Closed' }, 'different-org'),
      ).rejects.toThrow('Record not found');
    });

    it('updates and returns the status', async () => {
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
    it('sets isArchived to true', async () => {
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
    it('sets isArchived to false', async () => {
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
});
