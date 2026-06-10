import { Test, TestingModule } from '@nestjs/testing';
import { LeadsService } from './leads.service';
import { PrismaService } from '../../../core/database/prisma.service';

const mockLead = {
  id: '111222333',
  firstName: 'Clark',
  lastName: 'Dalisay',
  email: 'cdalisay@example.com',
  company: 'Geoplan',
  phoneNumber: null,
  status: 'PENDING' as const,
  message: 'I am interested',
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockPrismaService = {
  lead: {
    create: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
  },
};

describe('LeadsService', () => {
  let service: LeadsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LeadsService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<LeadsService>(LeadsService);
    jest.resetAllMocks();
  });

  describe('createLead', () => {
    const dto = {
      firstName: 'Juan',
      lastName: 'Dela Cruz',
      email: 'juan@example.com',
      message: 'I am interested',
    };

    it('propagates error when create fails', async () => {
      mockPrismaService.lead.create.mockRejectedValue(new Error('Unique constraint failed'));

      await expect(service.createLead({
        firstName: 'Juan',
        lastName: 'Dela Cruz',
        email: 'juan@example.com',
        message: 'I am interested',
      })).rejects.toThrow('Unique constraint failed');
    });
  });
});