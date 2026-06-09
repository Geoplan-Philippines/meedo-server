import { Test, TestingModule } from '@nestjs/testing';
import { SubscribersService } from './subscribers.service';
import { PrismaService } from '../../../../core/database/prisma.service';

const mockSubscriber = {
  id: '111222333',
  email: 'cdalisay@example.com',
  name: 'Clark Dalisay',
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockPrismaService = {
  newsletterSubscriber: {
    create: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
  },
};

describe('SubscribersService', () => {
  let service: SubscribersService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SubscribersService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<SubscribersService>(SubscribersService);
    jest.resetAllMocks();
  });

  describe('createSubscriber', () => {
    const dto = {
      email: 'juan@example.com',
      name: 'Juan Dela Cruz',
    };

    it('creates and returns a subscriber', async () => {
      mockPrismaService.newsletterSubscriber.create.mockResolvedValue(mockSubscriber);

      const result = await service.createSubscriber(dto);

      expect(mockPrismaService.newsletterSubscriber.create).toHaveBeenCalledWith({ data: dto });
      expect(result).toEqual(mockSubscriber);
    });
  });

  describe('getAllSubscribers', () => {
    it('returns paginated subscribers', async () => {
      mockPrismaService.newsletterSubscriber.findMany.mockResolvedValue([mockSubscriber]);
      mockPrismaService.newsletterSubscriber.count.mockResolvedValue(1);

      const result = await service.getAllSubscribers({ page: 1, limit: 10 });

      expect(result.data).toEqual([mockSubscriber]);
      expect(result.meta.total).toBe(1);
      expect(result.meta.page).toBe(1);
      expect(result.meta.lastPage).toBe(1);
    });

    it('calculates lastPage correctly', async () => {
      mockPrismaService.newsletterSubscriber.findMany.mockResolvedValue([]);
      mockPrismaService.newsletterSubscriber.count.mockResolvedValue(25);

      const result = await service.getAllSubscribers({ page: 1, limit: 10 });

      expect(result.meta.lastPage).toBe(3);
    });

    it('skips correct number of records based on page', async () => {
      mockPrismaService.newsletterSubscriber.findMany.mockResolvedValue([]);
      mockPrismaService.newsletterSubscriber.count.mockResolvedValue(0);

      await service.getAllSubscribers({ page: 3, limit: 10 });

      expect(mockPrismaService.newsletterSubscriber.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 20, take: 10 }),
      );
    });
  });
});