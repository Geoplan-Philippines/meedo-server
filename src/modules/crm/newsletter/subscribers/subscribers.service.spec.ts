import { ForbiddenException, ServiceUnavailableException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../../../../core/database/prisma.service';
import { DEFAULT_PUBLIC_ORG_SLUG } from '../../crm.constants';
import { SubscribersService } from './subscribers.service';

const org = 'org-a';
const user = 'user-a';
const otherOrg = 'org-b';

const mockSubscriber = {
  id: '111222333',
  organizationId: org,
  email: 'cdalisay@example.com',
  name: 'Clark Dalisay',
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockPrismaService = {
  organization: { findUnique: jest.fn() },
  member: { findUnique: jest.fn() },
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
    mockPrismaService.member.findUnique.mockResolvedValue({ id: 'member-a', role: 'member' });
    mockPrismaService.organization.findUnique.mockResolvedValue({ id: org });
  });

  describe('createSubscriber', () => {
    it('assigns the default organization and lowercases email', async () => {
      mockPrismaService.newsletterSubscriber.create.mockResolvedValue(mockSubscriber);
      await service.createSubscriber({ email: 'Juan@Example.com', name: 'Juan Dela Cruz' });
      expect(mockPrismaService.organization.findUnique).toHaveBeenCalledWith({
        where: { slug: DEFAULT_PUBLIC_ORG_SLUG },
        select: { id: true },
      });
      expect(mockPrismaService.newsletterSubscriber.create).toHaveBeenCalledWith({
        data: { email: 'juan@example.com', name: 'Juan Dela Cruz', organizationId: org },
      });
    });

    it('fails clearly when the default organization is not seeded', async () => {
      mockPrismaService.organization.findUnique.mockResolvedValue(null);
      await expect(service.createSubscriber({ email: 'juan@example.com' })).rejects.toThrow(ServiceUnavailableException);
      expect(mockPrismaService.newsletterSubscriber.create).not.toHaveBeenCalled();
    });

    it('propagates error when create fails', async () => {
      mockPrismaService.newsletterSubscriber.create.mockRejectedValue(new Error('Unique constraint failed'));

      await expect(service.createSubscriber({
        email: 'juan@example.com',
        name: 'Juan Dela Cruz',
      })).rejects.toThrow('Unique constraint failed');
    });
  });

  describe('getAllSubscribers', () => {
    it('returns paginated subscribers scoped to the active organization', async () => {
      mockPrismaService.newsletterSubscriber.findMany.mockResolvedValue([mockSubscriber]);
      mockPrismaService.newsletterSubscriber.count.mockResolvedValue(1);

      const result = await service.getAllSubscribers({ page: 1, limit: 10 }, org, user);

      expect(result.data).toEqual([mockSubscriber]);
      expect(result.meta.total).toBe(1);
      expect(mockPrismaService.newsletterSubscriber.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { organizationId: org } }),
      );
    });

    it('calculates lastPage correctly', async () => {
      mockPrismaService.newsletterSubscriber.findMany.mockResolvedValue([]);
      mockPrismaService.newsletterSubscriber.count.mockResolvedValue(25);

      const result = await service.getAllSubscribers({ page: 1, limit: 10 }, org, user);

      expect(result.meta.lastPage).toBe(3);
    });

    it('skips correct number of records based on page', async () => {
      mockPrismaService.newsletterSubscriber.findMany.mockResolvedValue([]);
      mockPrismaService.newsletterSubscriber.count.mockResolvedValue(0);

      await service.getAllSubscribers({ page: 3, limit: 10 }, org, user);

      expect(mockPrismaService.newsletterSubscriber.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 20, take: 10 }),
      );
    });

    it('does not return another organization subscriber', async () => {
      const rows = [mockSubscriber, { ...mockSubscriber, id: 'other', organizationId: otherOrg }];
      mockPrismaService.newsletterSubscriber.findMany.mockImplementation(({ where }: { where: { organizationId: string } }) =>
        Promise.resolve(rows.filter((row) => row.organizationId === where.organizationId)),
      );
      mockPrismaService.newsletterSubscriber.count.mockResolvedValue(1);
      const result = await service.getAllSubscribers({ page: 1, limit: 10 }, org, user);
      expect(result.data.map((row) => row.id)).toEqual([mockSubscriber.id]);
    });

    it('rejects a caller who is not a member before reading subscribers', async () => {
      mockPrismaService.member.findUnique.mockResolvedValue(null);
      await expect(service.getAllSubscribers({ page: 1, limit: 10 }, org, user)).rejects.toThrow(ForbiddenException);
      expect(mockPrismaService.newsletterSubscriber.findMany).not.toHaveBeenCalled();
    });
  });
});
