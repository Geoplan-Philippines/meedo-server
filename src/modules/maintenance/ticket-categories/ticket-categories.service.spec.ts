import { Test, TestingModule } from '@nestjs/testing';
import { TicketCategoriesService } from './ticket-categories.service';
import { PrismaService } from '../../../core/database/prisma.service';

const mockTicketCategory = {
  id: 'category-uuid-1',
  name: 'Hardware',
  description: 'Hardware tickets',
  organizationId: 'org-geo',
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockPrismaService = {
  ticketCategory: {
    create: jest.fn(),
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
      organizationId: 'org-geo',
    };

    it('creates and returns a ticket category', async () => {
      mockPrismaService.ticketCategory.create.mockResolvedValue(mockTicketCategory);

      const result = await service.createTicketCategory(dto);

      expect(mockPrismaService.ticketCategory.create).toHaveBeenCalledWith({
        data: {
          name: dto.name,
          description: dto.description,
          organization: { connect: { id: dto.organizationId } },
        },
      });
      expect(result).toEqual(mockTicketCategory);
    });
  });

  describe('deleteTicketCategory', () => {

    it('propagates error when category does not exist', async () => {
      mockPrismaService.ticketCategory.delete.mockRejectedValue(new Error('Record not found'));

      await expect(service.deleteTicketCategory('nonexistent-id')).rejects.toThrow('Record not found');
    });
  });
});
