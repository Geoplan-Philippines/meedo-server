import { BadRequestException } from '@nestjs/common';
import { DayOfWeek } from '@prisma/client';

/** Wall-clock "HH:mm" in 24-hour form, 00:00–23:59. */
export const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Minutes since local midnight for a valid "HH:mm" string. */
export function hhmmToMinutes(hhmm: string): number {
  const [hours, minutes] = hhmm.split(':').map(Number);
  return hours * 60 + minutes;
}

/**
 * Worked minutes a shift represents: end minus start minus the unpaid break,
 * rolling the end past midnight for overnight shifts (or when end < start).
 */
export function shiftWorkedMinutes(
  startTime: string,
  endTime: string,
  breakMinutes: number,
  crossesMidnight: boolean,
): number {
  let span = hhmmToMinutes(endTime) - hhmmToMinutes(startTime);
  if (crossesMidnight || span < 0) span += 24 * 60;
  return Math.max(0, span - breakMinutes);
}

/** Worked hours for a shift, rounded to 2 decimals. */
export function shiftWorkedHours(
  startTime: string,
  endTime: string,
  breakMinutes: number,
  crossesMidnight: boolean,
): number {
  const minutes = shiftWorkedMinutes(startTime, endTime, breakMinutes, crossesMidnight);
  return Math.round((minutes / 60) * 100) / 100;
}

/** Parse a "YYYY-MM-DD" (or ISO) value to the UTC instant of that calendar day. */
export function parseDateOnly(value: string): Date {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new BadRequestException('Invalid date value.');
  }
  return new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate()));
}

/** `YYYY-MM-DD` label for a UTC date-only instant. */
export function toDateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** `DayOfWeek` for a JS `getUTCDay()` index (0 = Sunday … 6 = Saturday). */
export const DAY_OF_WEEK_BY_INDEX: readonly DayOfWeek[] = [
  DayOfWeek.SUNDAY,
  DayOfWeek.MONDAY,
  DayOfWeek.TUESDAY,
  DayOfWeek.WEDNESDAY,
  DayOfWeek.THURSDAY,
  DayOfWeek.FRIDAY,
  DayOfWeek.SATURDAY,
];
