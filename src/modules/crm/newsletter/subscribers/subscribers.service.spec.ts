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

    it('propagates error when create fails', async () => {
      mockPrismaService.newsletterSubscriber.create.mockRejectedValue(new Error('Unique constraint failed'));

      await expect(service.createSubscriber({
        email: 'juan@example.com',
        name: 'Juan Dela Cruz',
      })).rejects.toThrow('Unique constraint failed');
    });
  });
});