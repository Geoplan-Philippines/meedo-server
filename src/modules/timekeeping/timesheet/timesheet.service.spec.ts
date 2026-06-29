import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { TimesheetEntryStatus, TimesheetWorkType } from '@prisma/client';

import { PrismaService } from '../../../core/database/prisma.service';
import { TimesheetService } from './timesheet.service';

const mockEntry = {
  id:                    'entry-1',
  organizationId:        'org-1',
  userId:                'user-1',
  projectId:             'project-1',
  workDate:              new Date('2026-06-22T00:00:00.000Z'),
  hours:                 8,
  location:              'OFC - DW',
  workType:              TimesheetWorkType.OFFICE_DIRECT_WORK,
  task:                  'Inspection work',
  projectDescription:    null,
  isOvertime:            false,
  isNightDifferential:   false,
  status:                TimesheetEntryStatus.DRAFT,
  submittedAt:           null,
  approvedAt:            null,
  approvedByMemberId:    null,
  approvedBy:            null,
  rejectedAt:            null,
  rejectedByMemberId:    null,
  rejectedBy:            null,
  rejectionReason:       null,
  createdAt:             new Date(),
  updatedAt:             new Date(),
  project: {
    id:              'project-1',
    customerName:    'Geoplan',
    workOrderNumber: 'WO-001',
    status:          'Open',
  },
};

const mockSummaryEntry = {
  ...mockEntry,
  userId: 'user-2',
  status: TimesheetEntryStatus.SUBMITTED,
  user: {
    id: 'user-2',
    name: 'Employee One',
    email: 'employee@example.com',
    teamMembers: [{ team: { id: 'team-1', name: 'Ops', organizationId: 'org-1' } }],
  },
};

const mockTx = {
  timesheetEntry: {
    create:     jest.fn(),
    update:     jest.fn(),
    delete:     jest.fn(),
    updateMany: jest.fn(),
    findMany:   jest.fn(),
  },
  timesheetPeriodLock: {
    findUnique: jest.fn(),
    upsert:     jest.fn(),
  },
  timesheetAuditLog: {
    create:     jest.fn(),
    createMany: jest.fn(),
  },
};

const mockPrismaService = {
  member: {
    findUnique: jest.fn(),
  },
  project: {
    findFirst: jest.fn(),
    findMany:  jest.fn(),
    count:     jest.fn(),
  },
  timesheetEntry: {
    findMany:   jest.fn(),
    findFirst:  jest.fn(),
    count:      jest.fn(),
    aggregate:  jest.fn(),
  },
  timesheetPeriodLock: {
    findFirst:  jest.fn(),
    findUnique: jest.fn(),
  },
  timesheetAuditLog: {
    create:   jest.fn(),
    findMany: jest.fn(),
    count:    jest.fn(),
  },
  organization: {
    findUnique: jest.fn(),
  },
  $transaction: jest.fn(),
};

describe('TimesheetService', () => {
  let service: TimesheetService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TimesheetService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<TimesheetService>(TimesheetService);
    jest.resetAllMocks();

    mockPrismaService.member.findUnique.mockResolvedValue({ id: 'member-1', role: 'member' });
    mockPrismaService.project.findFirst.mockResolvedValue({ id: 'project-1' });
    mockPrismaService.timesheetEntry.aggregate.mockResolvedValue({ _sum: { hours: 0 } });
    mockPrismaService.timesheetPeriodLock.findFirst.mockResolvedValue(null);
    mockPrismaService.timesheetPeriodLock.findUnique.mockResolvedValue(null);
    mockPrismaService.$transaction.mockImplementation((callback: (tx: typeof mockTx) => unknown) => callback(mockTx));
  });

  describe('getEntries', () => {
    it('returns only the current member user entries in the active organization', async () => {
      mockPrismaService.timesheetEntry.findMany.mockResolvedValue([mockEntry]);
      mockPrismaService.timesheetEntry.count.mockResolvedValue(1);

      const result = await service.getEntries('org-1', 'user-1', { page: 1, limit: 10 });

      expect(mockPrismaService.timesheetEntry.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ organizationId: 'org-1', userId: 'user-1' }),
        }),
      );
      expect(result.data).toEqual([mockEntry]);
      expect(result.meta.total).toBe(1);
    });

    it('rejects access when the user is not a member of the organization', async () => {
      mockPrismaService.member.findUnique.mockResolvedValue(null);

      await expect(service.getEntries('org-1', 'user-1', { page: 1, limit: 10 })).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('createEntry', () => {
    const dto = {
      projectId: 'project-1',
      workDate:  '2026-06-22',
      hours:     8,
      task:      'Inspection work',
    };

    it('creates a draft entry and writes an audit log', async () => {
      mockTx.timesheetEntry.create.mockResolvedValue(mockEntry);
      mockTx.timesheetAuditLog.create.mockResolvedValue({ id: 'audit-1' });

      const result = await service.createEntry('org-1', 'user-1', dto);

      expect(mockTx.timesheetEntry.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            organizationId: 'org-1',
            userId:         'user-1',
            projectId:      'project-1',
            status:         TimesheetEntryStatus.DRAFT,
          }),
        }),
      );
      expect(mockTx.timesheetAuditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ action: 'CREATED', actorMemberId: 'member-1' }),
        }),
      );
      expect(result).toEqual(mockEntry);
    });

    it('rejects entries when there is no authenticated user', async () => {
      await expect(service.createEntry('org-1', undefined, dto)).rejects.toThrow(ForbiddenException);
    });

    it('rejects a project outside the active organization', async () => {
      mockPrismaService.project.findFirst.mockResolvedValue(null);

      await expect(service.createEntry('org-1', 'user-1', dto)).rejects.toThrow(NotFoundException);
    });

    it('rejects entries that push the daily total above 24 hours', async () => {
      mockPrismaService.timesheetEntry.aggregate.mockResolvedValue({ _sum: { hours: 20 } });

      await expect(service.createEntry('org-1', 'user-1', { ...dto, hours: 5 })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rejects creation in a locked period server-side', async () => {
      mockPrismaService.timesheetPeriodLock.findFirst.mockResolvedValue({ id: 'lock-1' });

      await expect(service.createEntry('org-1', 'user-1', dto)).rejects.toThrow(ForbiddenException);
    });
  });

  describe('updateEntry', () => {
    it('updates only the current user draft entry', async () => {
      const updated = { ...mockEntry, hours: 6 };
      mockPrismaService.timesheetEntry.findFirst.mockResolvedValue(mockEntry);
      mockTx.timesheetEntry.update.mockResolvedValue(updated);
      mockTx.timesheetAuditLog.create.mockResolvedValue({ id: 'audit-1' });

      const result = await service.updateEntry('entry-1', 'org-1', 'user-1', { hours: 6 });

      expect(mockPrismaService.timesheetEntry.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'entry-1', organizationId: 'org-1', userId: 'user-1' },
        }),
      );
      expect(result.hours).toBe(6);
    });

    it('does not allow access to another user entry', async () => {
      mockPrismaService.timesheetEntry.findFirst.mockResolvedValue(null);

      await expect(service.updateEntry('entry-2', 'org-1', 'user-1', { hours: 6 })).rejects.toThrow(
        NotFoundException,
      );
    });

    it('does not allow updates to non-draft entries', async () => {
      mockPrismaService.timesheetEntry.findFirst.mockResolvedValue({
        ...mockEntry,
        status: TimesheetEntryStatus.APPROVED,
      });

      await expect(service.updateEntry('entry-1', 'org-1', 'user-1', { hours: 6 })).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('deleteEntry', () => {
    it('deletes only draft entries and records the delete audit log', async () => {
      mockPrismaService.timesheetEntry.findFirst.mockResolvedValue(mockEntry);
      mockTx.timesheetAuditLog.create.mockResolvedValue({ id: 'audit-1' });
      mockTx.timesheetEntry.delete.mockResolvedValue(mockEntry);

      await service.deleteEntry('entry-1', 'org-1', 'user-1');

      expect(mockTx.timesheetAuditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ action: 'DELETED' }) }),
      );
      expect(mockTx.timesheetEntry.delete).toHaveBeenCalledWith({ where: { id: 'entry-1' } });
    });
  });

  describe('submitWeek', () => {
    it('submits all draft entries in the selected week and audits each row', async () => {
      mockPrismaService.timesheetEntry.findMany.mockResolvedValue([mockEntry]);
      mockTx.timesheetEntry.updateMany.mockResolvedValue({ count: 1 });
      mockTx.timesheetAuditLog.createMany.mockResolvedValue({ count: 1 });
      mockTx.timesheetEntry.findMany.mockResolvedValue([{ ...mockEntry, status: TimesheetEntryStatus.SUBMITTED }]);

      const result = await service.submitWeek('org-1', 'user-1', {
        periodStart: '2026-06-22',
        periodEnd:   '2026-06-28',
      });

      expect(mockTx.timesheetEntry.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: { in: ['entry-1'] } }),
          data:  expect.objectContaining({ status: TimesheetEntryStatus.SUBMITTED }),
        }),
      );
      expect(mockTx.timesheetAuditLog.createMany).toHaveBeenCalledWith(
        expect.objectContaining({ data: [expect.objectContaining({ action: 'SUBMITTED' })] }),
      );
      expect(result.submittedCount).toBe(1);
    });

    it('rejects submission when the selected week is locked', async () => {
      mockPrismaService.timesheetPeriodLock.findFirst.mockResolvedValue({ id: 'lock-1' });

      await expect(service.submitWeek('org-1', 'user-1', {
        periodStart: '2026-06-22',
        periodEnd:   '2026-06-28',
      })).rejects.toThrow(ForbiddenException);
    });
  });

  describe('getSummary', () => {
    it('allows admins to view organization summary totals', async () => {
      mockPrismaService.member.findUnique.mockResolvedValue({ id: 'member-1', role: 'admin' });
      mockPrismaService.timesheetEntry.findMany.mockResolvedValue([mockSummaryEntry]);

      const result = await service.getSummary('org-1', 'admin-user', {
        periodStart: '2026-06-22',
        periodEnd:   '2026-06-28',
      });

      expect(mockPrismaService.timesheetEntry.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ organizationId: 'org-1' }),
        }),
      );
      expect(result.totalEmployees).toBe(1);
      expect(result.employees[0].status).toBe('PENDING');
    });

    it('rejects members from viewing approval summary', async () => {
      await expect(service.getSummary('org-1', 'user-1', {
        periodStart: '2026-06-22',
        periodEnd:   '2026-06-28',
      })).rejects.toThrow(ForbiddenException);
    });
  });

  describe('bulkApproveEntries', () => {
    it('approves submitted entries and writes audit logs', async () => {
      mockPrismaService.member.findUnique.mockResolvedValue({ id: 'approver-1', role: 'admin' });
      mockPrismaService.timesheetEntry.findMany.mockResolvedValue([mockSummaryEntry]);
      mockTx.timesheetEntry.updateMany.mockResolvedValue({ count: 1 });
      mockTx.timesheetAuditLog.createMany.mockResolvedValue({ count: 1 });
      mockTx.timesheetEntry.findMany.mockResolvedValue([{ ...mockSummaryEntry, status: TimesheetEntryStatus.APPROVED }]);

      const result = await service.bulkApproveEntries('org-1', 'admin-user', { entryIds: ['entry-1'] });

      expect(mockTx.timesheetEntry.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: TimesheetEntryStatus.APPROVED, approvedByMemberId: 'approver-1' }),
        }),
      );
      expect(mockTx.timesheetAuditLog.createMany).toHaveBeenCalledWith(
        expect.objectContaining({ data: [expect.objectContaining({ action: 'APPROVED' })] }),
      );
      expect(result.approvedCount).toBe(1);
    });

    it('rejects member approval attempts', async () => {
      await expect(service.bulkApproveEntries('org-1', 'user-1', { entryIds: ['entry-1'] })).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('prevents approvers from approving their own entries', async () => {
      mockPrismaService.member.findUnique.mockResolvedValue({ id: 'approver-1', role: 'admin' });
      mockPrismaService.timesheetEntry.findMany.mockResolvedValue([{ ...mockSummaryEntry, userId: 'admin-user' }]);

      await expect(service.bulkApproveEntries('org-1', 'admin-user', { entryIds: ['entry-1'] })).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('bulkRejectEntries', () => {
    it('requires a rejection reason', async () => {
      mockPrismaService.member.findUnique.mockResolvedValue({ id: 'approver-1', role: 'admin' });

      await expect(service.bulkRejectEntries('org-1', 'admin-user', {
        entryIds: ['entry-1'],
        reason:   '   ',
      })).rejects.toThrow(BadRequestException);
    });
  });

  describe('lockPeriod', () => {
    it('allows owners to lock a week and writes an audit log', async () => {
      const lockedPeriod = {
        id:                 'lock-1',
        organizationId:     'org-1',
        periodStart:        new Date('2026-06-22T00:00:00.000Z'),
        periodEnd:          new Date('2026-06-28T23:59:59.999Z'),
        isLocked:           true,
        lockedAt:           new Date(),
        lockedByMemberId:   'owner-member',
        lockedBy:           null,
        unlockedAt:         null,
        unlockedByMemberId: null,
        unlockedBy:         null,
        unlockReason:       null,
        createdAt:          new Date(),
        updatedAt:          new Date(),
      };
      mockPrismaService.member.findUnique.mockResolvedValue({ id: 'owner-member', role: 'owner' });
      mockTx.timesheetPeriodLock.findUnique.mockResolvedValue(null);
      mockTx.timesheetPeriodLock.upsert.mockResolvedValue(lockedPeriod);
      mockTx.timesheetAuditLog.create.mockResolvedValue({ id: 'audit-1' });

      const result = await service.lockPeriod('org-1', 'owner-user', {
        periodStart: '2026-06-22',
        periodEnd:   '2026-06-28',
      });

      expect(mockTx.timesheetPeriodLock.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ isLocked: true, lockedByMemberId: 'owner-member' }),
          update: expect.objectContaining({ isLocked: true, lockedByMemberId: 'owner-member' }),
        }),
      );
      expect(mockTx.timesheetAuditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ action: 'LOCKED_PERIOD' }) }),
      );
      expect(result).toEqual(lockedPeriod);
    });

    it('rejects non-owner lock attempts', async () => {
      mockPrismaService.member.findUnique.mockResolvedValue({ id: 'admin-member', role: 'admin' });

      await expect(service.lockPeriod('org-1', 'admin-user', {
        periodStart: '2026-06-22',
        periodEnd:   '2026-06-28',
      })).rejects.toThrow(ForbiddenException);
    });
  });

  describe('unlockPeriod', () => {
    it('allows owners to unlock with a reason even when no existing lock row exists', async () => {
      const unlockedPeriod = {
        id:                 'lock-1',
        organizationId:     'org-1',
        periodStart:        new Date('2026-06-22T00:00:00.000Z'),
        periodEnd:          new Date('2026-06-28T23:59:59.999Z'),
        isLocked:           false,
        lockedAt:           null,
        lockedByMemberId:   null,
        lockedBy:           null,
        unlockedAt:         new Date(),
        unlockedByMemberId: 'owner-member',
        unlockedBy:         null,
        unlockReason:       'Correction window',
        createdAt:          new Date(),
        updatedAt:          new Date(),
      };
      mockPrismaService.member.findUnique.mockResolvedValue({ id: 'owner-member', role: 'owner' });
      mockTx.timesheetPeriodLock.findUnique.mockResolvedValue(null);
      mockTx.timesheetPeriodLock.upsert.mockResolvedValue(unlockedPeriod);
      mockTx.timesheetAuditLog.create.mockResolvedValue({ id: 'audit-1' });

      const result = await service.unlockPeriod('org-1', 'owner-user', {
        periodStart: '2026-06-22',
        periodEnd:   '2026-06-28',
        reason:      'Correction window',
      });

      expect(mockTx.timesheetPeriodLock.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ isLocked: false, unlockReason: 'Correction window' }),
          update: expect.objectContaining({ isLocked: false, unlockReason: 'Correction window' }),
        }),
      );
      expect(mockTx.timesheetAuditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ action: 'UNLOCKED_PERIOD' }) }),
      );
      expect(result).toEqual(unlockedPeriod);
    });

    it('requires an unlock reason', async () => {
      mockPrismaService.member.findUnique.mockResolvedValue({ id: 'owner-member', role: 'owner' });

      await expect(service.unlockPeriod('org-1', 'owner-user', {
        periodStart: '2026-06-22',
        periodEnd:   '2026-06-28',
        reason:      '   ',
      })).rejects.toThrow(BadRequestException);
    });
  });

  describe('getAuditLogs', () => {
    it('returns paginated audit logs for admins', async () => {
      mockPrismaService.member.findUnique.mockResolvedValue({ id: 'admin-member', role: 'admin' });
      mockPrismaService.timesheetAuditLog.findMany.mockResolvedValue([{ id: 'audit-1', action: 'LOCKED_PERIOD' }]);
      mockPrismaService.timesheetAuditLog.count.mockResolvedValue(1);

      const result = await service.getAuditLogs('org-1', 'admin-user', { page: 1, limit: 10 });

      expect(mockPrismaService.timesheetAuditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { organizationId: 'org-1' } }),
      );
      expect(result.data).toEqual([{ id: 'audit-1', action: 'LOCKED_PERIOD' }]);
      expect(result.meta.total).toBe(1);
    });
  });

  describe('exportTimesheet', () => {
    it('creates an xlsx workbook and audit log for admins', async () => {
      mockPrismaService.member.findUnique.mockResolvedValue({ id: 'approver-1', role: 'owner' });
      mockPrismaService.timesheetEntry.findMany.mockResolvedValue([mockSummaryEntry]);
      mockPrismaService.organization.findUnique.mockResolvedValue({ id: 'org-1', name: 'Geoplan', slug: 'geoplan' });
      mockPrismaService.timesheetAuditLog.create.mockResolvedValue({ id: 'audit-1' });

      const result = await service.exportTimesheet('org-1', 'owner-user', {
        periodStart: '2026-06-22',
        periodEnd:   '2026-06-28',
      });

      expect(result.filename).toBe('timesheet-geoplan-2026-06-22-to-2026-06-28.xlsx');
      expect(result.mimeType).toContain('spreadsheetml');
      expect(result.buffer.length).toBeGreaterThan(0);
      expect(mockPrismaService.timesheetAuditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ action: 'EXPORTED' }) }),
      );
    });
  });
});
