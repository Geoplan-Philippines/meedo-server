import { AttendanceEventType } from '@prisma/client';

import { PrismaService } from '../../../core/database/prisma.service';
import {
  EffectiveSchedule,
  ScheduleResolverService,
} from '../../settings/attendance/assignments/resolver/schedule-resolver.service';
import { AttendanceBoardService } from './attendance-board.service';

const ORGANIZATION_ID = 'org-1';
// A finished day, so the board grades without a live "upcoming" window.
const PAST_DATE = '2026-06-25';
// Company time is UTC+8: 07:00 local (on time) and 09:00 local (late for 08:00 + 15).
const ON_TIME = new Date('2026-06-24T23:00:00.000Z');
const LATE = new Date('2026-06-25T01:00:00.000Z');

const SHIFT = { id: 'shift-1', name: 'Day', startTime: '08:00', endTime: '17:00', graceMinutes: 15, isFlexible: false };

const scheduled = {
  source: 'organization-default',
  schedule: { id: 'sched-1', name: 'Standard', isDefault: true },
  isWorkingDay: true,
  isRestDay: false,
  expectedSource: 'OFFICE',
  expectedHours: 8,
  isFlexible: false,
  trackLateness: true,
  shift: SHIFT,
  isHoliday: false,
  policy: { graceMinutes: 15 },
} as const;

const unscheduled = {
  ...scheduled,
  source: 'none',
  schedule: null,
  isWorkingDay: null,
  isRestDay: null,
  expectedSource: null,
  expectedHours: 0,
  shift: null,
} as const;

const restDay = { ...scheduled, isWorkingDay: false, isRestDay: true } as const;

/** Each employee: their effective schedule and first punch (null = no punch). */
const FIXTURE: Record<string, { effective: object; firstIn: Date | null }> = {
  'u-present': { effective: scheduled, firstIn: ON_TIME },
  'u-late': { effective: scheduled, firstIn: LATE },
  'u-absent': { effective: scheduled, firstIn: null },
  'u-unscheduled-in': { effective: unscheduled, firstIn: LATE },
  'u-unscheduled-out': { effective: unscheduled, firstIn: null },
  'u-rest': { effective: restDay, firstIn: null },
};

function employee(id: string) {
  return { id, name: id, email: `${id}@example.test`, employeeCode: null, teamMembers: [] };
}

describe('AttendanceBoardService', () => {
  let service: AttendanceBoardService;

  beforeEach(() => {
    const ids = Object.keys(FIXTURE);
    const prisma = {
      member: { findMany: jest.fn().mockResolvedValue(ids.map((id) => ({ user: employee(id) }))) },
      attendance: {
        findMany: jest.fn().mockResolvedValue(
          ids
            .filter((id) => FIXTURE[id].firstIn)
            .map((id) => ({ employeeId: id, firstIn: FIXTURE[id].firstIn, lastOut: null, billableHours: 2 })),
        ),
      },
      attendanceEvent: {
        findMany: jest.fn().mockResolvedValue([{ employeeId: 'u-unscheduled-in', eventType: AttendanceEventType.OFFICE_IN }]),
      },
    };
    const resolver = {
      resolveEffectiveForUsers: jest.fn().mockResolvedValue(
        new Map(
          ids.map((id) => [id, { userId: id, date: PAST_DATE, dayOfWeek: 'THURSDAY', ...FIXTURE[id].effective } as EffectiveSchedule]),
        ),
      ),
    };
    service = new AttendanceBoardService(
      prisma as unknown as PrismaService,
      resolver as unknown as ScheduleResolverService,
    );
  });

  it('counts an unscheduled time-in as Present but not as scheduled, and keeps no-punch unscheduled in Off', async () => {
    const summary = await service.getSummary(ORGANIZATION_ID, PAST_DATE);

    expect(summary).toMatchObject({
      present: 3, // on time + late + unscheduled time-in
      late: 1,
      absent: 1,
      upcoming: 0,
      off: 2, // rest day + unscheduled without a punch
      scheduled: 3, // on time + late + absent
      total: 6,
    });
  });

  it('includes present_unscheduled under the Present filter', async () => {
    const result = await service.getRoster(ORGANIZATION_ID, { page: 1, limit: 20, date: PAST_DATE, status: 'present' });

    expect(result.meta.total).toBe(3);
    expect(result.data.map((row) => [row.employeeId, row.status.status]).sort()).toEqual([
      ['u-late', 'late'],
      ['u-present', 'present'],
      ['u-unscheduled-in', 'present_unscheduled'],
    ]);
    expect(result.data.find((row) => row.employeeId === 'u-unscheduled-in')?.status.lateMinutes).toBe(0);
  });

  it('keeps no_schedule (no punch) and rest days under the Off filter', async () => {
    const result = await service.getRoster(ORGANIZATION_ID, { page: 1, limit: 20, date: PAST_DATE, status: 'off' });

    expect(result.data.map((row) => [row.employeeId, row.status.status]).sort()).toEqual([
      ['u-rest', 'rest_day'],
      ['u-unscheduled-out', 'no_schedule'],
    ]);
  });
});
