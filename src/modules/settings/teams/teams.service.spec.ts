import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { TeamsService } from './teams.service';
import { PrismaService } from '../../../core/database/prisma.service';

/** Mirrors TEAM_MEMBER_SELECT in teams.service.ts (the const isn't exported). */
const TEAM_MEMBER_SELECT = {
  id: true,
  teamId: true,
  userId: true,
  createdAt: true,
  user: { select: { id: true, name: true, email: true, image: true } },
};

const mockMember = {
  id: 'team-member-1',
  teamId: 'team-1',
  userId: 'user-1',
  createdAt: new Date(),
  user: { id: 'user-1', name: 'Ada', email: 'ada@geo.dev', image: null },
};

const mockPrismaService = {
  team: {
    findFirst: jest.fn(),
  },
  member: {
    findFirst: jest.fn(),
  },
  teamMember: {
    findMany: jest.fn(),
    upsert: jest.fn(),
    deleteMany: jest.fn(),
  },
};

describe('TeamsService', () => {
  let service: TeamsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TeamsService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<TeamsService>(TeamsService);
    jest.resetAllMocks();
  });

  describe('listTeamMembers', () => {
    it('rejects a team that does not belong to the organization', async () => {
      mockPrismaService.team.findFirst.mockResolvedValue(null);

      await expect(service.listTeamMembers('team-1', 'org-geo')).rejects.toThrow(
        NotFoundException,
      );
      expect(mockPrismaService.teamMember.findMany).not.toHaveBeenCalled();
    });

    it('scopes the team lookup to the organization', async () => {
      mockPrismaService.team.findFirst.mockResolvedValue({ id: 'team-1' });
      mockPrismaService.teamMember.findMany.mockResolvedValue([mockMember]);

      await service.listTeamMembers('team-1', 'org-geo');

      expect(mockPrismaService.team.findFirst).toHaveBeenCalledWith({
        where: { id: 'team-1', organizationId: 'org-geo' },
        select: { id: true },
      });
    });

    it('returns members ordered by createdAt', async () => {
      mockPrismaService.team.findFirst.mockResolvedValue({ id: 'team-1' });
      mockPrismaService.teamMember.findMany.mockResolvedValue([mockMember]);

      const result = await service.listTeamMembers('team-1', 'org-geo');

      expect(mockPrismaService.teamMember.findMany).toHaveBeenCalledWith({
        where: { teamId: 'team-1' },
        orderBy: { createdAt: 'asc' },
        select: TEAM_MEMBER_SELECT,
      });
      expect(result).toEqual([mockMember]);
    });

    it('returns an empty roster for a team with no members', async () => {
      mockPrismaService.team.findFirst.mockResolvedValue({ id: 'team-1' });
      mockPrismaService.teamMember.findMany.mockResolvedValue([]);

      const result = await service.listTeamMembers('team-1', 'org-geo');

      expect(result).toEqual([]);
    });
  });

  describe('addTeamMember', () => {
    it('rejects a team outside the organization before touching membership', async () => {
      mockPrismaService.team.findFirst.mockResolvedValue(null);

      await expect(service.addTeamMember('team-1', 'user-1', 'org-geo')).rejects.toThrow(
        NotFoundException,
      );
      expect(mockPrismaService.member.findFirst).not.toHaveBeenCalled();
      expect(mockPrismaService.teamMember.upsert).not.toHaveBeenCalled();
    });

    it('rejects a user who is not a member of the organization', async () => {
      mockPrismaService.team.findFirst.mockResolvedValue({ id: 'team-1' });
      mockPrismaService.member.findFirst.mockResolvedValue(null);

      await expect(service.addTeamMember('team-1', 'user-1', 'org-geo')).rejects.toThrow(
        BadRequestException,
      );
      expect(mockPrismaService.member.findFirst).toHaveBeenCalledWith({
        where: { userId: 'user-1', organizationId: 'org-geo' },
        select: { id: true },
      });
      expect(mockPrismaService.teamMember.upsert).not.toHaveBeenCalled();
    });

    it('upserts the link idempotently and returns it', async () => {
      mockPrismaService.team.findFirst.mockResolvedValue({ id: 'team-1' });
      mockPrismaService.member.findFirst.mockResolvedValue({ id: 'member-1' });
      mockPrismaService.teamMember.upsert.mockResolvedValue(mockMember);

      const result = await service.addTeamMember('team-1', 'user-1', 'org-geo');

      // update:{} makes re-adding an existing member a no-op — never a duplicate.
      expect(mockPrismaService.teamMember.upsert).toHaveBeenCalledWith({
        where: { teamId_userId: { teamId: 'team-1', userId: 'user-1' } },
        update: {},
        create: { teamId: 'team-1', userId: 'user-1' },
        select: TEAM_MEMBER_SELECT,
      });
      expect(result).toEqual(mockMember);
    });
  });

  describe('removeTeamMember', () => {
    it('rejects a team outside the organization before deleting', async () => {
      mockPrismaService.team.findFirst.mockResolvedValue(null);

      await expect(service.removeTeamMember('team-1', 'user-1', 'org-geo')).rejects.toThrow(
        NotFoundException,
      );
      expect(mockPrismaService.teamMember.deleteMany).not.toHaveBeenCalled();
    });

    it('deletes only the team-user link and echoes the identifiers', async () => {
      mockPrismaService.team.findFirst.mockResolvedValue({ id: 'team-1' });
      mockPrismaService.teamMember.deleteMany.mockResolvedValue({ count: 1 });

      const result = await service.removeTeamMember('team-1', 'user-1', 'org-geo');

      expect(mockPrismaService.teamMember.deleteMany).toHaveBeenCalledWith({
        where: { teamId: 'team-1', userId: 'user-1' },
      });
      expect(result).toEqual({ teamId: 'team-1', userId: 'user-1' });
    });

    it('is a no-op when the user is not on the team', async () => {
      mockPrismaService.team.findFirst.mockResolvedValue({ id: 'team-1' });
      mockPrismaService.teamMember.deleteMany.mockResolvedValue({ count: 0 });

      const result = await service.removeTeamMember('team-1', 'user-1', 'org-geo');

      expect(result).toEqual({ teamId: 'team-1', userId: 'user-1' });
    });
  });
});
