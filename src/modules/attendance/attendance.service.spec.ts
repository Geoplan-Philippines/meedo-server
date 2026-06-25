import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AttendanceEventType, AttendanceOrigin, AttendanceSource } from '@prisma/client';

import { AttendanceService } from './attendance.service';
import { PrismaService } from '../../core/database/prisma.service';

const EMPLOYEE_ID = 'employee-uuid-1';

// 2026-06-25 in Asia/Manila (UTC+8): local midnight == 2026-06-24T16:00:00Z.
const FIRST_IN = new Date('2026-06-25T00:00:00.000Z'); // 08:00 local
const LAST_OUT = new Date('2026-06-25T09:00:00.000Z'); // 17:00 local
const DAY_KEY_ISO = '2026-06-24T16:00:00.000Z';

const mockTx = {
  attendanceEvent: {
    create: jest.fn(),
    aggregate: jest.fn(),
  },
  attendance: {
    upsert: jest.fn(),
    deleteMany: jest.fn(),
  },
};

const mockPrismaService = {
  attendanceEvent: {
    findMany: jest.fn(),
    count: jest.fn(),
  },
  attendance: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    count: jest.fn(),
  },
  $transaction: jest.fn(),
};

describe('AttendanceService', () => {
  let service: AttendanceService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AttendanceService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<AttendanceService>(AttendanceService);
    jest.resetAllMocks();
    mockPrismaService.$transaction.mockImplementation((fn: Function) => fn(mockTx));
  });

  describe('recordAttendanceEvent', () => {
    it('persists a FIELD_IN with the derived source and MANUAL origin', async () => {
      const createdEvent = { id: 'event-1' };
      mockTx.attendanceEvent.create.mockResolvedValue(createdEvent);
      mockTx.attendanceEvent.aggregate.mockResolvedValue({
        _min: { timestamp: FIRST_IN },
        _max: { timestamp: FIRST_IN },
      });

      const result = await service.recordAttendanceEvent(EMPLOYEE_ID, {
        eventType: AttendanceEventType.FIELD_IN,
        timestamp: FIRST_IN.toISOString(),
      });

      expect(mockTx.attendanceEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          employeeId: EMPLOYEE_ID,
          eventType: AttendanceEventType.FIELD_IN,
          source: AttendanceSource.FIELD,
          origin: AttendanceOrigin.MANUAL,
          timestamp: FIRST_IN,
        }),
      });
      expect(result).toBe(createdEvent);
    });

    it('computes first-in / last-out / billable hours across merged sources', async () => {
      mockTx.attendanceEvent.create.mockResolvedValue({ id: 'event-2' });
      // Day already has an 08:00 office tap; the new 17:00 field-out closes it.
      mockTx.attendanceEvent.aggregate.mockResolvedValue({
        _min: { timestamp: FIRST_IN },
        _max: { timestamp: LAST_OUT },
      });

      await service.recordAttendanceEvent(EMPLOYEE_ID, {
        eventType: AttendanceEventType.FIELD_OUT,
        timestamp: LAST_OUT.toISOString(),
      });

      expect(mockTx.attendance.upsert).toHaveBeenCalledWith({
        where: { employeeId_date: { employeeId: EMPLOYEE_ID, date: new Date(DAY_KEY_ISO) } },
        create: {
          employeeId: EMPLOYEE_ID,
          date: new Date(DAY_KEY_ISO),
          firstIn: FIRST_IN,
          lastOut: LAST_OUT,
          billableHours: 9,
        },
        update: { firstIn: FIRST_IN, lastOut: LAST_OUT, billableHours: 9 },
      });
    });

    it('rejects a future timestamp', async () => {
      const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();

      await expect(
        service.recordAttendanceEvent(EMPLOYEE_ID, {
          eventType: AttendanceEventType.WFH_IN,
          timestamp: future,
        }),
      ).rejects.toThrow(BadRequestException);

      expect(mockPrismaService.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('getMyAttendanceHistory', () => {
    it('returns paginated computed attendance for the employee', async () => {
      const record = { id: 'att-1', employeeId: EMPLOYEE_ID, billableHours: 9 };
      mockPrismaService.attendance.findMany.mockResolvedValue([record]);
      mockPrismaService.attendance.count.mockResolvedValue(1);

      const result = await service.getMyAttendanceHistory(EMPLOYEE_ID, { page: 1, limit: 10 });

      expect(mockPrismaService.attendance.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { employeeId: EMPLOYEE_ID }, skip: 0, take: 10 }),
      );
      expect(result.data).toEqual([record]);
      expect(result.meta.total).toBe(1);
    });

    it('applies an inclusive day-key range filter', async () => {
      mockPrismaService.attendance.findMany.mockResolvedValue([]);
      mockPrismaService.attendance.count.mockResolvedValue(0);

      await service.getMyAttendanceHistory(EMPLOYEE_ID, {
        page: 1,
        limit: 10,
        fromDate: '2026-06-01',
        toDate: '2026-06-25',
      });

      const where = mockPrismaService.attendance.findMany.mock.calls[0][0].where;
      expect(where.date.gte.toISOString()).toBe('2026-05-31T16:00:00.000Z');
      expect(where.date.lte.toISOString()).toBe('2026-06-24T16:00:00.000Z');
    });
  });

  describe('getDailyAttendance', () => {
    it('merges the computed record with its ordered timeline', async () => {
      const events = [{ id: 'e1' }, { id: 'e2' }];
      mockPrismaService.attendance.findUnique.mockResolvedValue({
        firstIn: FIRST_IN,
        lastOut: LAST_OUT,
        billableHours: 9,
      });
      mockPrismaService.attendanceEvent.findMany.mockResolvedValue(events);

      const result = await service.getDailyAttendance(EMPLOYEE_ID, '2026-06-25');

      expect(result).toEqual({
        date: new Date(DAY_KEY_ISO),
        firstIn: FIRST_IN,
        lastOut: LAST_OUT,
        billableHours: 9,
        events,
      });
    });

    it('returns null computed fields when no record exists', async () => {
      mockPrismaService.attendance.findUnique.mockResolvedValue(null);
      mockPrismaService.attendanceEvent.findMany.mockResolvedValue([]);

      const result = await service.getDailyAttendance(EMPLOYEE_ID, '2026-06-25');

      expect(result.firstIn).toBeNull();
      expect(result.lastOut).toBeNull();
      expect(result.billableHours).toBeNull();
      expect(result.events).toEqual([]);
    });
  });
});
