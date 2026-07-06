import {
  computeBillableHours,
  getAttendanceDayKey,
  getAttendanceDayRange,
  parseAttendanceDate,
} from './attendance-day.util';

// All assertions use UTC+8 (Asia/Manila) instants, e.g. 08:00 local == 00:00 UTC.

describe('attendance-day util', () => {
  describe('getAttendanceDayKey', () => {
    it('anchors an instant to local midnight (UTC instant)', () => {
      // 2026-06-25 08:00 local == 2026-06-25 00:00 UTC
      const key = getAttendanceDayKey(new Date('2026-06-25T00:00:00.000Z'));
      expect(key.toISOString()).toBe('2026-06-24T16:00:00.000Z');
    });

    it('keeps an early-morning local instant on the same local day', () => {
      // 2026-06-25 01:00 local == 2026-06-24 17:00 UTC, still the 25th locally
      const key = getAttendanceDayKey(new Date('2026-06-24T17:00:00.000Z'));
      expect(key.toISOString()).toBe('2026-06-24T16:00:00.000Z');
    });

    it('rolls a late-evening local instant into the correct local day', () => {
      // 2026-06-25 23:00 local == 2026-06-25 15:00 UTC
      const key = getAttendanceDayKey(new Date('2026-06-25T15:00:00.000Z'));
      expect(key.toISOString()).toBe('2026-06-24T16:00:00.000Z');
    });
  });

  describe('getAttendanceDayRange', () => {
    it('produces a 24h half-open range from local midnight', () => {
      const { start, end } = getAttendanceDayRange(new Date('2026-06-25T00:00:00.000Z'));
      expect(start.toISOString()).toBe('2026-06-24T16:00:00.000Z');
      expect(end.toISOString()).toBe('2026-06-25T16:00:00.000Z');
    });
  });

  describe('parseAttendanceDate', () => {
    it('parses YYYY-MM-DD as local midnight', () => {
      expect(parseAttendanceDate('2026-06-25').toISOString()).toBe('2026-06-24T16:00:00.000Z');
    });
  });

  describe('computeBillableHours', () => {
    it('returns whole hours between first-in and last-out', () => {
      // 08:00 -> 17:00 local == 9 hours
      const firstIn = new Date('2026-06-25T00:00:00.000Z');
      const lastOut = new Date('2026-06-25T09:00:00.000Z');
      expect(computeBillableHours(firstIn, lastOut)).toBe(9);
    });

    it('rounds to two decimals', () => {
      const firstIn = new Date('2026-06-25T00:00:00.000Z');
      const lastOut = new Date('2026-06-25T08:30:00.000Z');
      expect(computeBillableHours(firstIn, lastOut)).toBe(8.5);
    });

    it('returns 0 when only a single event exists', () => {
      const instant = new Date('2026-06-25T00:00:00.000Z');
      expect(computeBillableHours(instant, instant)).toBe(0);
    });
  });
});
