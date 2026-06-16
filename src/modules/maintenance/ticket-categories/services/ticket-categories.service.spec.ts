import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';

import { TicketCategoriesService } from './ticket-categories.service';
import { PrismaService } from '../../../../core/database/prisma.service';

const organizationId = 'org-geo';

const mockTicketCategory = {
  id: 'category-uuid-1',
  name: 'Hardware',
  description: 'Hardware tickets',
  organizationId,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockPrismaService = {
  ticketCategory: {
    create: jest.fn(),
    findFirst: jest.fn(),
    delete: jest.fn(),
  },
};

describe('TicketCategoriesService', () => {
  let service: TicketCategoriesService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TicketCategoriesService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<TicketCategoriesService>(TicketCategoriesService);
    jest.resetAllMocks();
  });

  describe('createTicketCategory', () => {
    const dto = {
      name: 'Hardware',
      description: 'Hardware tickets',
    };

    it('creates a category scoped to the current organization', async () => {
      mockPrismaService.ticketCategory.create.mockResolvedValue(mockTicketCategory);

      const result = await service.createTicketCategory(dto, organizationId);

      expect(mockPrismaService.ticketCategory.create).toHaveBeenCalledWith({
        data: {
          name: dto.name,
          description: dto.description,
          organization: { connect: { id: organizationId } },
        },
      });
      expect(result).toEqual(mockTicketCategory);
    });
  });

  describe('deleteTicketCategory', () => {
    it('deletes a category that belongs to the organization', async () => {
      mockPrismaService.ticketCategory.findFirst.mockResolvedValue({ id: 'category-uuid-1' });
      mockPrismaService.ticketCategory.delete.mockResolvedValue(mockTicketCategory);

      const result = await service.deleteTicketCategory('category-uuid-1', organizationId);

      expect(mockPrismaService.ticketCategory.delete).toHaveBeenCalledWith({
        where: { id: 'category-uuid-1' },
      });
      expect(result).toEqual(mockTicketCategory);
    });

    it('throws NotFoundException when the category is missing or in another org', async () => {
      mockPrismaService.ticketCategory.findFirst.mockResolvedValue(null);

      await expect(
        service.deleteTicketCategory('nonexistent-id', organizationId),
      ).rejects.toThrow(NotFoundException);

      expect(mockPrismaService.ticketCategory.delete).not.toHaveBeenCalled();
    });
  });
});
