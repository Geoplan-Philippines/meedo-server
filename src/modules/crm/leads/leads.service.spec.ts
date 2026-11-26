import { ForbiddenException, ServiceUnavailableException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { LeadStatus } from '@prisma/client';

import { PrismaService } from '../../../core/database/prisma.service';
import { DEFAULT_PUBLIC_ORG_SLUG } from '../crm.constants';
import { LeadsService } from './leads.service';

const org = 'org-a';
const user = 'user-a';
const otherOrg = 'org-b';

const mockLead = {
  id: '111222333',
  organizationId: org,
  firstName: 'Clark',
  lastName: 'Dalisay',
  email: 'cdalisay@example.com',
  company: 'Geoplan',
  phoneNumber: null,
  status: 'NEW' as const,
  isArchived: false,
  message: 'I am interested',
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockPrismaService = {
  organization: { findUnique: jest.fn() },
  member: { findUnique: jest.fn() },
  lead: {
    create: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    groupBy: jest.fn(),
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
    mockPrismaService.member.findUnique.mockResolvedValue({ id: 'member-a', role: 'member' });
    mockPrismaService.organization.findUnique.mockResolvedValue({ id: org });
  });

  it('returns NEW, CONTACTED, QUALIFIED, and LOST counts for the active organization only', async () => {
    mockPrismaService.lead.groupBy.mockResolvedValue([
      { status: 'NEW', _count: { _all: 2 } },
      { status: 'QUALIFIED', _count: { _all: 1 } },
    ]);
    await expect(service.getStats(org, user)).resolves.toEqual({ total: 3, new: 2, contacted: 0, qualified: 1, lost: 0 });
    expect(mockPrismaService.lead.groupBy).toHaveBeenCalledWith({
      by: ['status'],
      where: { organizationId: org },
      _count: { _all: true },
    });
  });

  describe('createLead', () => {
    it('assigns the default organization and lowercases email', async () => {
      mockPrismaService.lead.create.mockResolvedValue(mockLead);
      await service.createLead({
        firstName: 'Juan',
        lastName: 'Dela Cruz',
        email: 'Juan@Example.com',
        message: 'I am interested',
      });
      expect(mockPrismaService.organization.findUnique).toHaveBeenCalledWith({
        where: { slug: DEFAULT_PUBLIC_ORG_SLUG },
        select: { id: true },
      });
      expect(mockPrismaService.lead.create).toHaveBeenCalledWith({
        data: {
          firstName: 'Juan',
          lastName: 'Dela Cruz',
          email: 'juan@example.com',
          message: 'I am interested',
          organizationId: org,
        },
      });
    });

    it('fails clearly when the default organization is not seeded', async () => {
      mockPrismaService.organization.findUnique.mockResolvedValue(null);
      await expect(service.createLead({
        firstName: 'Juan',
        lastName: 'Dela Cruz',
        email: 'juan@example.com',
        message: 'I am interested',
      })).rejects.toThrow(ServiceUnavailableException);
      expect(mockPrismaService.lead.create).not.toHaveBeenCalled();
    });

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

  describe('getAllLeads', () => {
    it('returns paginated leads scoped to the active organization', async () => {
      mockPrismaService.lead.findMany.mockResolvedValue([mockLead]);
      mockPrismaService.lead.count.mockResolvedValue(1);

      const result = await service.getAllLeads({ page: 1, limit: 10 }, org, user);

      expect(result.data).toEqual([mockLead]);
      expect(result.meta.total).toBe(1);
      expect(mockPrismaService.lead.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { organizationId: org } }),
      );
    });

    it('calculates lastPage correctly', async () => {
      mockPrismaService.lead.findMany.mockResolvedValue([]);
      mockPrismaService.lead.count.mockResolvedValue(25);

      const result = await service.getAllLeads({ page: 1, limit: 10 }, org, user);

      expect(result.meta.lastPage).toBe(3);
    });

    it('skips correct number of records based on page', async () => {
      mockPrismaService.lead.findMany.mockResolvedValue([]);
      mockPrismaService.lead.count.mockResolvedValue(0);

      await service.getAllLeads({ page: 3, limit: 10 }, org, user);

      expect(mockPrismaService.lead.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 20, take: 10 }),
      );
    });

    it('does not return another organization lead', async () => {
      const rows = [mockLead, { ...mockLead, id: 'other', organizationId: otherOrg }];
      mockPrismaService.lead.findMany.mockImplementation(({ where }: { where: { organizationId: string } }) =>
        Promise.resolve(rows.filter((row) => row.organizationId === where.organizationId)),
      );
      mockPrismaService.lead.count.mockResolvedValue(1);
      const result = await service.getAllLeads({ page: 1, limit: 10 }, org, user);
      expect(result.data.map((row) => row.id)).toEqual([mockLead.id]);
    });

    it('rejects a caller who is not a member before reading leads', async () => {
      mockPrismaService.member.findUnique.mockResolvedValue(null);
      await expect(service.getAllLeads({ page: 1, limit: 10 }, org, user)).rejects.toThrow(ForbiddenException);
      expect(mockPrismaService.lead.findMany).not.toHaveBeenCalled();
    });
  });

  it('rejects stats without membership', async () => {
    mockPrismaService.member.findUnique.mockResolvedValue(null);
    await expect(service.getStats(org, user)).rejects.toThrow(ForbiddenException);
    expect(mockPrismaService.lead.groupBy).not.toHaveBeenCalled();
  });

  it('filters list and count by NEW when requested', async () => {
    mockPrismaService.lead.findMany.mockResolvedValue([]);
    mockPrismaService.lead.count.mockResolvedValue(0);
    await service.getAllLeads({ page: 1, limit: 10, status: LeadStatus.NEW }, org, user);
    expect(mockPrismaService.lead.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { organizationId: org, status: LeadStatus.NEW } }),
    );
  });
});
