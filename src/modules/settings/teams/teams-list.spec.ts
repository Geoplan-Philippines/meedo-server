import { ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../../../core/database/prisma.service';
import { TeamsService } from './teams.service';

const prisma = {
  member: { findFirst: jest.fn() },
  team: { findMany: jest.fn(), count: jest.fn() },
};

const team = { id: 'team-1', name: 'Ops', organizationId: 'org-1', createdAt: new Date(), updatedAt: new Date(), _count: { teamMembers: 4 } };

describe('TeamsService.listTeams', () => {
  let service: TeamsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [TeamsService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get(TeamsService);
    jest.resetAllMocks();
    prisma.member.findFirst.mockResolvedValue({ id: 'caller' });
    prisma.team.findMany.mockResolvedValue([team]);
    prisma.team.count.mockResolvedValue(1);
  });

  it('pages teams A-Z with member counts', async () => {
    const result = await service.listTeams({ page: 1, limit: 25 }, 'org-1', 'user-1');

    const row = { id: team.id, name: team.name, organizationId: team.organizationId, createdAt: team.createdAt, updatedAt: team.updatedAt, memberCount: 4 };
    expect(result).toEqual({ data: [row], meta: { total: 1, page: 1, limit: 25, lastPage: 1 } });
    expect(prisma.team.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { organizationId: 'org-1' },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      skip: 0,
      take: 25,
    }));
  });

  it('keeps only the caller\'s teams with mine, searches by name and sorts by member count', async () => {
    await service.listTeams({ page: 1, limit: 10, mine: true, search: 'op', sortField: 'memberCount', sortOrder: 'desc' }, 'org-1', 'user-1');

    const where = { organizationId: 'org-1', teamMembers: { some: { userId: 'user-1' } }, name: { contains: 'op', mode: 'insensitive' } };
    expect(prisma.team.findMany).toHaveBeenCalledWith(expect.objectContaining({ where, orderBy: [{ teamMembers: { _count: 'desc' } }, { id: 'asc' }] }));
    expect(prisma.team.count).toHaveBeenCalledWith({ where });
  });

  it('refuses callers outside the organization', async () => {
    prisma.member.findFirst.mockResolvedValue(null);
    await expect(service.listTeams({ page: 1, limit: 10 }, 'org-1', 'outsider')).rejects.toThrow(ForbiddenException);
    expect(prisma.team.findMany).not.toHaveBeenCalled();
  });
});
