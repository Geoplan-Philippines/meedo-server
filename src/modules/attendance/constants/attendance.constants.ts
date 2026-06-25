import { AttendanceEventType, AttendanceSource, Prisma } from '@prisma/client';

/**
 * Company timezone offset in minutes (Asia/Manila, UTC+8, no DST). Attendance
 * days are anchored to this offset so the "first in / last out" policy is
 * evaluated against the employee's local calendar day.
 */
export const ATTENDANCE_TIMEZONE_OFFSET_MINUTES = 8 * 60;

/**
 * Event types an employee may record manually from the web app. Manual office
 * uses its own OFFICE_IN / OFFICE_OUT types so it is never conflated with the
 * biometric OFFICE_ACCESS event ingested from the door device.
 */
export const MANUAL_EVENT_TYPES = [
  AttendanceEventType.OFFICE_IN,
  AttendanceEventType.OFFICE_OUT,
  AttendanceEventType.FIELD_IN,
  AttendanceEventType.FIELD_OUT,
  AttendanceEventType.WFH_IN,
  AttendanceEventType.WFH_OUT,
] as const;

export type ManualEventType = (typeof MANUAL_EVENT_TYPES)[number];

/** Each event type belongs to exactly one attendance source. */
export const EVENT_TYPE_SOURCE: Record<AttendanceEventType, AttendanceSource> = {
  [AttendanceEventType.OFFICE_ACCESS]: AttendanceSource.OFFICE,
  [AttendanceEventType.OFFICE_IN]: AttendanceSource.OFFICE,
  [AttendanceEventType.OFFICE_OUT]: AttendanceSource.OFFICE,
  [AttendanceEventType.FIELD_IN]: AttendanceSource.FIELD,
  [AttendanceEventType.FIELD_OUT]: AttendanceSource.FIELD,
  [AttendanceEventType.WFH_IN]: AttendanceSource.WFH,
  [AttendanceEventType.WFH_OUT]: AttendanceSource.WFH,
};

export type AttendanceRecord = Prisma.AttendanceGetPayload<object>;
export type AttendanceEventRecord = Prisma.AttendanceEventGetPayload<object>;

/** Computed view of a single attendance day plus its underlying timeline. */
export interface DailyAttendanceSummary {
  date: Date;
  firstIn: Date | null;
  lastOut: Date | null;
  billableHours: number | null;
  events: AttendanceEventRecord[];
}

/** Organization roles that may view every employee's attendance, not just their own. */
export const ORG_MANAGER_ROLES = ['owner', 'admin'] as const;

/** One employee's computed attendance for a day, as shown on the org roster. */
export interface RosterEntry {
  employeeId: string;
  name: string | null;
  email: string;
  employeeCode: string | null;
  department: string | null;
  firstIn: Date | null;
  lastOut: Date | null;
  clockedHours: number | null;
}
