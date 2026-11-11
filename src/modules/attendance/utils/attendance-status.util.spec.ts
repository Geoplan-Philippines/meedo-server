import { EffectiveSchedule } from '../../settings/attendance/assignments/resolver/schedule-resolver.service';
import { deriveDayStatus } from './attendance-status.util';

// Company time is UTC+8, so 08:00 local is 00:00Z.
const LOCAL_0900 = new Date('2026-06-25T01:00:00.000Z');
const LOCAL_0700 = new Date('2026-06-24T23:00:00.000Z');

const SHIFT = { id: 'shift-1', name: 'Day', startTime: '08:00', endTime: '17:00', graceMinutes: 15, isFlexible: false };

function effective(overrides: Partial<EffectiveSchedule> = {}): EffectiveSchedule {
  return {
    userId: 'user-1',
    date: '2026-06-25',
    dayOfWeek: 'THURSDAY',
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
    ...overrides,
  } as EffectiveSchedule;
}

const unscheduled = (overrides: Partial<EffectiveSchedule> = {}) =>
  effective({ source: 'none', schedule: null, isWorkingDay: null, isRestDay: null, expectedHours: 0, ...overrides });

const punched = { firstIn: LOCAL_0900, lastOut: null, billableHours: 3 };
const noPunch = { firstIn: null, lastOut: null, billableHours: null };

describe('deriveDayStatus', () => {
  describe('no schedule resolved', () => {
    it('is no_schedule when there is no punch', () => {
      expect(deriveDayStatus(unscheduled(), noPunch).status).toBe('no_schedule');
    });

    it('is present_unscheduled once the employee times in, with no late minutes', () => {
      const result = deriveDayStatus(unscheduled(), punched);
      expect(result).toMatchObject({ status: 'present_unscheduled', lateMinutes: 0, workedHours: 3 });
    });

    it('never counts lateness even if a stray shift is attached', () => {
      const result = deriveDayStatus(unscheduled({ shift: SHIFT } as Partial<EffectiveSchedule>), punched);
      expect(result).toMatchObject({ status: 'present_unscheduled', lateMinutes: 0 });
    });

    it('treats a schedule with no rule for the day as unscheduled', () => {
      const result = deriveDayStatus(effective({ isWorkingDay: null }), punched);
      expect(result).toMatchObject({ status: 'present_unscheduled', lateMinutes: 0 });
    });

    it('stays no_schedule on the live view before any punch', () => {
      expect(deriveDayStatus(unscheduled(), noPunch, LOCAL_0700).status).toBe('no_schedule');
    });
  });

  describe('scheduled days keep their rules', () => {
    it('reports a holiday even when the employee worked', () => {
      expect(deriveDayStatus(effective({ isHoliday: true }), punched).status).toBe('holiday');
    });

    it('reports a rest day even when the employee worked', () => {
      const result = deriveDayStatus(effective({ isWorkingDay: false, isRestDay: true }), punched);
      expect(result.status).toBe('rest_day');
    });

    it('grades a punch after start + grace as late', () => {
      expect(deriveDayStatus(effective(), punched)).toMatchObject({ status: 'late', lateMinutes: 45 });
    });

    it('grades an early punch as present', () => {
      const result = deriveDayStatus(effective(), { ...punched, firstIn: LOCAL_0700 });
      expect(result).toMatchObject({ status: 'present', lateMinutes: 0 });
    });

    it('is upcoming before the shift is due and absent on a finished day', () => {
      expect(deriveDayStatus(effective(), noPunch, LOCAL_0700).status).toBe('upcoming');
      expect(deriveDayStatus(effective(), noPunch).status).toBe('absent');
    });
  });
});
