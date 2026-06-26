import {
  ATTENDANCE_TIMEZONE_OFFSET_MINUTES,
  AUTO_CLOCK_OUT_HOUR,
} from '../constants/attendance.constants';

const OFFSET_MS = ATTENDANCE_TIMEZONE_OFFSET_MINUTES * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

/**
 * The attendance "day" is anchored to the company's local timezone (no DST),
 * so an 08:00 local biometric tap and a 17:00 local field tap land on the same
 * day regardless of how the underlying UTC instants fall.
 *
 * Every helper returns/accepts plain UTC `Date` instants; the local offset only
 * matters while deciding which calendar day an instant belongs to.
 */

/** UTC instant of local midnight for the calendar day that contains `instant`. */
export function getAttendanceDayKey(instant: Date): Date {
  const shifted = new Date(instant.getTime() + OFFSET_MS);
  const localMidnight = Date.UTC(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth(),
    shifted.getUTCDate(),
  );
  return new Date(localMidnight - OFFSET_MS);
}

/** Half-open UTC range `[start, end)` covering the local day of `dayKey`. */
export function getAttendanceDayRange(dayKey: Date): { start: Date; end: Date } {
  const start = getAttendanceDayKey(dayKey);
  return { start, end: new Date(start.getTime() + DAY_MS) };
}

/**
 * Parse a `YYYY-MM-DD` string as a local calendar day and return the UTC
 * instant of its local midnight (the value stored in `Attendance.date`).
 */
export function parseAttendanceDate(date: string): Date {
  const [year, month, day] = date.split('-').map(Number);
  const localMidnight = Date.UTC(year, month - 1, day);
  return new Date(localMidnight - OFFSET_MS);
}

/**
 * UTC instant of the auto-clock-out cutoff (local `AUTO_CLOCK_OUT_HOUR`) for the
 * calendar day that contains `instant`.
 */
export function getAutoClockOutInstant(instant: Date): Date {
  return new Date(getAttendanceDayKey(instant).getTime() + AUTO_CLOCK_OUT_HOUR * HOUR_MS);
}

/** Whole-hour-aware billable hours between two instants, rounded to 2 decimals. */
export function computeBillableHours(firstIn: Date, lastOut: Date): number {
  const hours = (lastOut.getTime() - firstIn.getTime()) / (60 * 60 * 1000);
  return Math.round(hours * 100) / 100;
}
