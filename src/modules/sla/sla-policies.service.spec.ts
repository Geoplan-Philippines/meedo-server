import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { SlaPoliciesService } from './sla-policies.service';
import { PrismaService } from '../../core/database/prisma.service';

const mockPolicy = {
  id:                   'sla-uuid-1',
  name:                 'Standard SLA',
  documentUrl:          null,
  priority:             'HIGH' as const,
  firstResponseMinutes: 60,
  resolutionMinutes:    480,
  businessHoursOnly:    false,
  isActive:             true,
  isArchived:           false,
  organizationId:       'org-geo',
  projectId:            null,
  createdAt:            new Date(),
  updatedAt:            new Date(),
  project:              null,
};

const mockPrismaService = {
  slaPolicy: {
    findMany:  jest.fn(),
    findFirst: jest.fn(),
    count:     jest.fn(),
    create:    jest.fn(),
    update:    jest.fn(),
  },
  project: {
    findFirst: jest.fn(),
  },
};

describe('SlaPoliciesService', () => {
  let service: SlaPoliciesService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SlaPoliciesService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<SlaPoliciesService>(SlaPoliciesService);
    jest.resetAllMocks();
  });

  describe('getAllSlaPolicies', () => {
    it('returns paginated policies excluding archived', async () => {
      mockPrismaService.slaPolicy.findMany.mockResolvedValue([mockPolicy]);
      mockPrismaService.slaPolicy.count.mockResolvedValue(1);

      const result = await service.getAllSlaPolicies({ page: 1, limit: 10 }, 'org-geo');

      expect(mockPrismaService.slaPolicy.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ isArchived: false }),
        }),
      );
      expect(result.data).toEqual([mockPolicy]);
      expect(result.meta.total).toBe(1);
      expect(result.meta.lastPage).toBe(1);
    });

    it('calculates lastPage correctly', async () => {
      mockPrismaService.slaPolicy.findMany.mockResolvedValue([]);
      mockPrismaService.slaPolicy.count.mockResolvedValue(25);

      const result = await service.getAllSlaPolicies({ page: 1, limit: 10 }, 'org-geo');

      expect(result.meta.lastPage).toBe(3);
    });
  });

  describe('getSlaPolicyById', () => {
    it('returns the policy when found', async () => {
      mockPrismaService.slaPolicy.findFirst.mockResolvedValue(mockPolicy);

      const result = await service.getSlaPolicyById('sla-uuid-1', 'org-geo');

      expect(result).toEqual(mockPolicy);
    });

    it('throws NotFoundException when policy does not exist', async () => {
      mockPrismaService.slaPolicy.findFirst.mockResolvedValue(null);

      await expect(service.getSlaPolicyById('bad-id', 'org-geo')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('createSlaPolicy', () => {
    const dto = {
      name:                 'Standard SLA',
      priority:             'HIGH' as const,
      firstResponseMinutes: 60,
      resolutionMinutes:    480,
    };

    it('creates and returns a policy', async () => {
      mockPrismaService.slaPolicy.findFirst.mockResolvedValue(null);
      mockPrismaService.slaPolicy.create.mockResolvedValue(mockPolicy);

      const result = await service.createSlaPolicy(dto, 'org-geo');

      expect(mockPrismaService.slaPolicy.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            name:                 dto.name,
            priority:             dto.priority,
            firstResponseMinutes: dto.firstResponseMinutes,
            resolutionMinutes:    dto.resolutionMinutes,
            organizationId:       'org-geo',
          }),
        }),
      );
      expect(result).toEqual(mockPolicy);
    });

    it('throws ConflictException when duplicate org + project combo exists', async () => {
      mockPrismaService.slaPolicy.findFirst.mockResolvedValue(mockPolicy);

      await expect(service.createSlaPolicy(dto, 'org-geo')).rejects.toThrow(
        ConflictException,
      );
    });

    it('throws NotFoundException when projectId does not belong to org', async () => {
      mockPrismaService.project.findFirst.mockResolvedValue(null);
      mockPrismaService.slaPolicy.findFirst.mockResolvedValue(null);

      await expect(
        service.createSlaPolicy({ ...dto, projectId: 'bad-project' }, 'org-geo'),
      ).rejects.toThrow(NotFoundException);
    });

    it('checks duplicates per org + project + priority, so one project can have a policy per priority', async () => {
      mockPrismaService.project.findFirst.mockResolvedValue({ id: 'project-1', isArchived: false });
      mockPrismaService.slaPolicy.findFirst.mockResolvedValue(null);
      mockPrismaService.slaPolicy.create.mockResolvedValue(mockPolicy);

      await service.createSlaPolicy({ ...dto, priority: 'LOW', projectId: 'project-1' }, 'org-geo');

      expect(mockPrismaService.slaPolicy.findFirst).toHaveBeenCalledWith({
        where: { organizationId: 'org-geo', projectId: 'project-1', priority: 'LOW', isArchived: false },
        select: { id: true },
      });
      expect(mockPrismaService.slaPolicy.create).toHaveBeenCalled();
    });

    it('rejects an archived project with 400', async () => {
      mockPrismaService.project.findFirst.mockResolvedValue({ id: 'project-1', isArchived: true });

      await expect(
        service.createSlaPolicy({ ...dto, projectId: 'project-1' }, 'org-geo'),
      ).rejects.toThrow(BadRequestException);
      expect(mockPrismaService.slaPolicy.create).not.toHaveBeenCalled();
    });
  });

  describe('updateSlaPolicy', () => {
    const dto = { name: 'Updated SLA' };

    it('updates and returns the policy', async () => {
      const updated = { ...mockPolicy, name: 'Updated SLA' };
      mockPrismaService.slaPolicy.findFirst.mockResolvedValue(mockPolicy);
      mockPrismaService.slaPolicy.update.mockResolvedValue(updated);

      const result = await service.updateSlaPolicy('sla-uuid-1', dto, 'org-geo');

      expect(result.name).toBe('Updated SLA');
    });

    it('throws NotFoundException when policy does not exist', async () => {
      mockPrismaService.slaPolicy.findFirst.mockResolvedValue(null);

      await expect(
        service.updateSlaPolicy('bad-id', dto, 'org-geo'),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when resolutionMinutes is not greater than firstResponseMinutes', async () => {
      mockPrismaService.slaPolicy.findFirst.mockResolvedValue(mockPolicy);

      await expect(
        service.updateSlaPolicy(
          'sla-uuid-1',
          { firstResponseMinutes: 480, resolutionMinutes: 60 },
          'org-geo',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws ConflictException when new projectId is already assigned to another policy', async () => {
      const conflictingPolicy = { ...mockPolicy, id: 'sla-uuid-2', projectId: 'project-1' };
      mockPrismaService.slaPolicy.findFirst
        .mockResolvedValueOnce(mockPolicy)
        .mockResolvedValueOnce(conflictingPolicy);

      mockPrismaService.project.findFirst.mockResolvedValue({ id: 'project-1' });

      await expect(
        service.updateSlaPolicy('sla-uuid-1', { projectId: 'project-1' }, 'org-geo'),
      ).rejects.toThrow(ConflictException);
    });

    it('re-checks duplicates when only the priority changes', async () => {
      const projectPolicy = { ...mockPolicy, projectId: 'project-1' };
      mockPrismaService.slaPolicy.findFirst
        .mockResolvedValueOnce(projectPolicy)
        .mockResolvedValueOnce({ id: 'sla-uuid-2' });

      await expect(
        service.updateSlaPolicy('sla-uuid-1', { priority: 'URGENT' }, 'org-geo'),
      ).rejects.toThrow(ConflictException);
      expect(mockPrismaService.slaPolicy.findFirst).toHaveBeenLastCalledWith({
        where: { organizationId: 'org-geo', projectId: 'project-1', priority: 'URGENT', isArchived: false, id: { not: 'sla-uuid-1' } },
        select: { id: true },
      });
    });

    it('rejects moving the policy to an archived project', async () => {
      mockPrismaService.slaPolicy.findFirst.mockResolvedValue(mockPolicy);
      mockPrismaService.project.findFirst.mockResolvedValue({ id: 'project-gone', isArchived: true });

      await expect(
        service.updateSlaPolicy('sla-uuid-1', { projectId: 'project-gone' }, 'org-geo'),
      ).rejects.toThrow(BadRequestException);
      expect(mockPrismaService.slaPolicy.update).not.toHaveBeenCalled();
    });

    it('still saves a policy whose project is archived when the project is unchanged', async () => {
      const onArchived = { ...mockPolicy, projectId: 'project-gone' };
      mockPrismaService.slaPolicy.findFirst.mockResolvedValue(onArchived);
      mockPrismaService.project.findFirst.mockResolvedValue({ id: 'project-gone', isArchived: true });
      mockPrismaService.slaPolicy.update.mockResolvedValue({ ...onArchived, name: 'Renamed' });

      await service.updateSlaPolicy('sla-uuid-1', { name: 'Renamed', projectId: 'project-gone' }, 'org-geo');

      expect(mockPrismaService.slaPolicy.update).toHaveBeenCalled();
    });
  });

  describe('updateSlaPolicyDocument', () => {
    it('updates documentUrl and returns the policy', async () => {
      const updated = { ...mockPolicy, documentUrl: 'https://example.com/sla.pdf' };
      mockPrismaService.slaPolicy.findFirst.mockResolvedValue(mockPolicy);
      mockPrismaService.slaPolicy.update.mockResolvedValue(updated);

      const result = await service.updateSlaPolicyDocument(
        'sla-uuid-1',
        'org-geo',
        'https://example.com/sla.pdf',
      );

      expect(mockPrismaService.slaPolicy.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { documentUrl: 'https://example.com/sla.pdf' },
        }),
      );
      expect(result.documentUrl).toBe('https://example.com/sla.pdf');
    });

    it('throws NotFoundException when policy does not exist', async () => {
      mockPrismaService.slaPolicy.findFirst.mockResolvedValue(null);

      await expect(
        service.updateSlaPolicyDocument('bad-id', 'org-geo', 'https://example.com/sla.pdf'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('removeSlaPolicyDocument', () => {
    it('clears documentUrl and returns the policy', async () => {
      const withDoc   = { ...mockPolicy, documentUrl: 'https://example.com/sla.pdf' };
      const withoutDoc = { ...mockPolicy, documentUrl: null };
      mockPrismaService.slaPolicy.findFirst.mockResolvedValue(withDoc);
      mockPrismaService.slaPolicy.update.mockResolvedValue(withoutDoc);

      const result = await service.removeSlaPolicyDocument('sla-uuid-1', 'org-geo');

      expect(mockPrismaService.slaPolicy.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { documentUrl: null } }),
      );
      expect(result.documentUrl).toBeNull();
    });

    it('throws NotFoundException when policy does not exist', async () => {
      mockPrismaService.slaPolicy.findFirst.mockResolvedValue(null);

      await expect(
        service.removeSlaPolicyDocument('bad-id', 'org-geo'),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when no document is attached', async () => {
      mockPrismaService.slaPolicy.findFirst.mockResolvedValue(mockPolicy);

      await expect(
        service.removeSlaPolicyDocument('sla-uuid-1', 'org-geo'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('deleteSlaPolicy', () => {
    it('archives the policy by setting isArchived to true', async () => {
      mockPrismaService.slaPolicy.findFirst.mockResolvedValue(mockPolicy);
      mockPrismaService.slaPolicy.update.mockResolvedValue({ ...mockPolicy, isArchived: true });

      await service.deleteSlaPolicy('sla-uuid-1', 'org-geo');

      expect(mockPrismaService.slaPolicy.update).toHaveBeenCalledWith({
        where: { id: 'sla-uuid-1' },
        data:  { isArchived: true },
      });
    });

    it('throws NotFoundException when policy does not exist', async () => {
      mockPrismaService.slaPolicy.findFirst.mockResolvedValue(null);

      await expect(
        service.deleteSlaPolicy('bad-id', 'org-geo'),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
