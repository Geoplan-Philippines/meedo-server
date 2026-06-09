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

    it('creates and returns a lead', async () => {
      mockPrismaService.lead.create.mockResolvedValue(mockLead);

      const result = await service.createLead(dto);

      expect(mockPrismaService.lead.create).toHaveBeenCalledWith({ data: dto });
      expect(result).toEqual(mockLead);
    });
  });

  describe('getAllLeads', () => {
    it('returns paginated leads', async () => {
      mockPrismaService.lead.findMany.mockResolvedValue([mockLead]);
      mockPrismaService.lead.count.mockResolvedValue(1);

      const result = await service.getAllLeads({ page: 1, limit: 10 });

      expect(result.data).toEqual([mockLead]);
      expect(result.meta.total).toBe(1);
      expect(result.meta.page).toBe(1);
      expect(result.meta.lastPage).toBe(1);
    });

    it('calculates lastPage correctly', async () => {
      mockPrismaService.lead.findMany.mockResolvedValue([]);
      mockPrismaService.lead.count.mockResolvedValue(25);

      const result = await service.getAllLeads({ page: 1, limit: 10 });

      expect(result.meta.lastPage).toBe(3);
    });

    it('skips correct number of records based on page', async () => {
      mockPrismaService.lead.findMany.mockResolvedValue([]);
      mockPrismaService.lead.count.mockResolvedValue(0);

      await service.getAllLeads({ page: 3, limit: 10 });

      expect(mockPrismaService.lead.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 20, take: 10 }),
      );
    });
  });
});