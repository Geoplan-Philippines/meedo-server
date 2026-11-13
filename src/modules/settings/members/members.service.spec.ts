import { ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../../../core/database/prisma.service';
import { MEMBER_LIST_SELECT, MembersService } from './members.service';

const prisma = {
  member: { findUnique: jest.fn(), findMany: jest.fn(), count: jest.fn() },
};

const row = {
  id: 'member-1',
  organizationId: 'org-1',
  userId: 'user-1',
  role: 'member',
  createdAt: new Date('2026-01-01'),
  user: { id: 'user-1', name: 'Ada', email: 'ada@example.com', image: null },
};

describe('MembersService.listMembers', () => {
  let service: MembersService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [MembersService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get(MembersService);
    jest.resetAllMocks();
    prisma.member.findUnique.mockResolvedValue({ id: 'caller' });
    prisma.member.findMany.mockResolvedValue([row]);
    prisma.member.count.mockResolvedValue(31);
  });

  it('returns one page with the total, sorted by name with empty names last', async () => {
    const result = await service.listMembers({ page: 2, limit: 10 }, 'org-1', 'user-9');

    expect(result).toEqual({ data: [row], meta: { total: 31, page: 2, limit: 10, lastPage: 4 } });
    expect(prisma.member.findMany).toHaveBeenCalledWith({
      where: { organizationId: 'org-1' },
      select: MEMBER_LIST_SELECT,
      orderBy: [{ user: { name: { sort: 'asc', nulls: 'last' } } }, { id: 'asc' }],
      skip: 10,
      take: 10,
    });
    expect(prisma.member.count).toHaveBeenCalledWith({ where: { organizationId: 'org-1' } });
  });

  it('searches name and email per word and narrows to a team in the same organization', async () => {
    await service.listMembers({ page: 1, limit: 20, search: 'ada lovelace', teamId: 'team-1', role: 'admin', sortField: 'email', sortOrder: 'desc' }, 'org-1', 'user-9');

    const where = {
      organizationId: 'org-1',
      role: 'admin',
      user: { teamMembers: { some: { teamId: 'team-1', team: { organizationId: 'org-1' } } } },
      AND: ['ada', 'lovelace'].map((term) => ({
        OR: [
          { user: { name: { contains: term, mode: 'insensitive' } } },
          { user: { email: { contains: term, mode: 'insensitive' } } },
        ],
      })),
    };
    expect(prisma.member.findMany).toHaveBeenCalledWith(expect.objectContaining({ where, orderBy: [{ user: { email: 'desc' } }, { id: 'asc' }] }));
    expect(prisma.member.count).toHaveBeenCalledWith({ where });
  });

  it('refuses callers who are not members of the organization', async () => {
    prisma.member.findUnique.mockResolvedValue(null);
    await expect(service.listMembers({ page: 1, limit: 10 }, 'org-1', 'outsider')).rejects.toThrow(ForbiddenException);
    await expect(service.listMembers({ page: 1, limit: 10 }, 'org-1', undefined)).rejects.toThrow(ForbiddenException);
    expect(prisma.member.findMany).not.toHaveBeenCalled();
  });
});
