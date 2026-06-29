import { AttendanceEventType, AttendanceSource, Prisma } from '@prisma/client';

import { PaginationMeta } from 'src/common/responses/paginated-api.response';

/**
 * Company timezone (IANA). Single source of truth for the cron schedule and the
 * offset below — both describe the same zone, so keep them in sync here.
 */
export const COMPANY_TIMEZONE = 'Asia/Manila';

/**
 * Company timezone offset in minutes (`COMPANY_TIMEZONE`, UTC+8, no DST).
 * Attendance days are anchored to this offset so the "first in / last out"
 * policy is evaluated against the employee's local calendar day.
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

/** Event types that close a session. A day whose latest event is one of these is
 * already clocked out and must never be auto-closed. */
export const OUT_EVENT_TYPES: ReadonlySet<AttendanceEventType> = new Set([
  AttendanceEventType.OFFICE_OUT,
  AttendanceEventType.FIELD_OUT,
  AttendanceEventType.WFH_OUT,
]);

/** The OUT event a system auto-clock-out emits for each open session's source. */
export const SOURCE_AUTO_OUT_EVENT: Record<AttendanceSource, AttendanceEventType> = {
  [AttendanceSource.OFFICE]: AttendanceEventType.OFFICE_OUT,
  [AttendanceSource.FIELD]: AttendanceEventType.FIELD_OUT,
  [AttendanceSource.WFH]: AttendanceEventType.WFH_OUT,
};

/**
 * Local hour (Asia/Manila) at which an employee still clocked in is automatically
 * clocked out. A real punch after this time still wins, because `lastOut` is the
 * day's maximum event timestamp.
 */
export const AUTO_CLOCK_OUT_HOUR = 18;

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

/**
 * Roster pagination meta plus `viewerIsManager`, so the client can tell whether
 * the caller sees the whole org (and therefore needs the employee search) or
 * only their own row.
 */
export interface RosterMeta extends PaginationMeta {
  viewerIsManager: boolean;
}

export interface RosterResult {
  data: RosterEntry[];
  meta: RosterMeta;
}
