import { AttendanceSource } from '@prisma/client';

import { EffectiveSchedule } from '../../settings/attendance/assignments/resolver/schedule-resolver.service';
import { ATTENDANCE_TIMEZONE_OFFSET_MINUTES } from '../constants/attendance.constants';

const OFFSET_MS = ATTENDANCE_TIMEZONE_OFFSET_MINUTES * 60 * 1000;

/**
 * How a graded day reads against its schedule:
 *  - `no_schedule` — no weekly schedule resolved for the employee that day.
 *  - `holiday`     — the date is a company holiday.
 *  - `rest_day`    — a non-working day on the schedule.
 *  - `upcoming`    — a working day, no punch yet, but the shift isn't due yet (live board only).
 *  - `absent`      — a working day past due (or a finished day) with no punches.
 *  - `late`        — first punch landed after shift start + grace (fixed shifts).
 *  - `present`     — on a working day, on time (or a flexible shift).
 */
export type AttendanceStatus =
  | 'no_schedule'
  | 'holiday'
  | 'rest_day'
  | 'upcoming'
  | 'absent'
  | 'late'
  | 'present';

/** Schedule-derived grade for a single attendance day, layered onto the raw record. */
export interface AttendanceDayStatus {
  status: AttendanceStatus;
  schedule: { id: string; name: string; isDefault: boolean } | null;
  source: EffectiveSchedule['source'];
  isWorkingDay: boolean | null;
  isRestDay: boolean | null;
  isHoliday: boolean;
  isFlexible: boolean;
  expectedSource: AttendanceSource | null;
  expectedHours: number;
  workedHours: number | null;
  /** Minutes past shift start + grace on a fixed shift; 0 when on time or flexible. */
  lateMinutes: number;
  shift: { id: string; name: string; startTime: string; endTime: string } | null;
}

/** The materialized side of a day: what the employee actually did. */
interface ActualDay {
  firstIn: Date | null;
  lastOut: Date | null;
  billableHours: number | null;
}

/** Minutes since local (company-timezone) midnight for a UTC instant. */
function localMinutesOfDay(instant: Date): number {
  const shifted = new Date(instant.getTime() + OFFSET_MS);
  return shifted.getUTCHours() * 60 + shifted.getUTCMinutes();
}

/** Minutes since midnight for a validated "HH:mm" string. */
function hhmmToMinutes(hhmm: string): number {
  const [hours, minutes] = hhmm.split(':').map(Number);
  return hours * 60 + minutes;
}

/**
 * Grade one day against its effective schedule. Pure: given the resolved
 * schedule and the raw first-in/last-out record, it derives the status, the
 * expected vs worked hours, and lateness. Holidays and rest days are reported as
 * such even if the employee worked, so the client can still show the worked
 * hours (e.g. as premium) alongside the day's real character.
 */
export function deriveDayStatus(
  effective: EffectiveSchedule,
  actual: ActualDay,
  asOf: Date | null = null,
): AttendanceDayStatus {
  const shift = effective.shift
    ? {
        id: effective.shift.id,
        name: effective.shift.name,
        startTime: effective.shift.startTime,
        endTime: effective.shift.endTime,
      }
    : null;

  const lateMinutes = computeLateMinutes(effective, actual.firstIn);

  return {
    status: computeStatus(effective, actual, lateMinutes, asOf),
    schedule: effective.schedule,
    source: effective.source,
    isWorkingDay: effective.isWorkingDay,
    isRestDay: effective.isRestDay,
    isHoliday: effective.isHoliday,
    isFlexible: effective.isFlexible,
    expectedSource: effective.expectedSource,
    expectedHours: effective.expectedHours,
    workedHours: actual.billableHours,
    lateMinutes,
    shift,
  };
}

function computeStatus(
  effective: EffectiveSchedule,
  actual: ActualDay,
  lateMinutes: number,
  asOf: Date | null,
): AttendanceStatus {
  if (!effective.schedule || effective.isWorkingDay === null) return 'no_schedule';
  if (effective.isHoliday) return 'holiday';
  if (!effective.isWorkingDay) return 'rest_day';
  if (!actual.firstIn) return isUpcoming(effective, asOf) ? 'upcoming' : 'absent';
  return lateMinutes > 0 ? 'late' : 'present';
}

/**
 * A working day with no punch is only "upcoming" (not absent) on a live view:
 * `asOf` is the current instant, and either the shift is flexible (can start any
 * time) or its start + grace hasn't passed yet. With no `asOf` (a finished or
 * historical day), a missing punch is a plain absence.
 */
function isUpcoming(effective: EffectiveSchedule, asOf: Date | null): boolean {
  if (!asOf) return false;
  // A day that doesn't record lateness (flexible or WFH-any-time) can start any
  // time, so with no punch yet it's still upcoming, never absent-by-clock.
  if (effective.isFlexible || !effective.trackLateness || !effective.shift) return true;
  const grace = effective.shift.graceMinutes ?? effective.policy.graceMinutes;
  const due = hhmmToMinutes(effective.shift.startTime) + grace;
  return localMinutesOfDay(asOf) < due;
}

/**
 * Lateness only applies to a fixed shift on a working day with a real punch. A
 * flexible shift, or a day the schedule marks as not tracking lateness, is never
 * late. Grace comes from the shift when set, otherwise from the org policy.
 */
function computeLateMinutes(effective: EffectiveSchedule, firstIn: Date | null): number {
  if (
    !firstIn ||
    !effective.shift ||
    effective.isFlexible ||
    !effective.trackLateness ||
    effective.isWorkingDay !== true ||
    effective.isHoliday
  ) {
    return 0;
  }

  const grace = effective.shift.graceMinutes ?? effective.policy.graceMinutes;
  const threshold = hhmmToMinutes(effective.shift.startTime) + grace;
  return Math.max(0, localMinutesOfDay(firstIn) - threshold);
}
