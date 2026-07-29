import { PaginationMeta } from 'src/common/responses/paginated-api.response';

import { AttendanceDayStatus } from '../utils/attendance-status.util';
import { TardinessPeriod } from './dto/get-tardiness-query.dto';

/** Headline counts for one attendance day, graded against each employee's schedule. */
export interface BoardSummary {
  /** The day being viewed, `YYYY-MM-DD` (local). */
  date: string;
  /** Instant the board was computed (ISO). For a past day, the end of that day. */
  asOf: string;
  isToday: boolean;
  /** Employees whose schedule has them working this day (present + absent + upcoming). */
  scheduled: number;
  /** Everyone who showed up on a working day, including late arrivals. */
  present: number;
  /** The subset of `present` who arrived late. */
  late: number;
  absent: number;
  /** Working today but their shift isn't due yet (live view only). */
  upcoming: number;
  /** Rest day, holiday, or no schedule resolved. */
  off: number;
  /** Every employee in the organization. */
  total: number;
  /** Employees clocked in right now (open session today). */
  availableNow: number;
}

/** One employee's row on the board for the viewed day. */
export interface BoardRosterEntry {
  employeeId: string;
  name: string | null;
  email: string;
  employeeCode: string | null;
  department: string | null;
  status: AttendanceDayStatus;
  firstIn: Date | null;
  /** Clocked in right now (open session today), independent of the viewed day. */
  available: boolean;
}

/** One employee's lateness aggregate over the scoreboard window. */
export interface TardinessEntry {
  rank: number;
  employeeId: string;
  name: string | null;
  email: string;
  employeeCode: string | null;
  department: string | null;
  /** Days in the window graded `late`. */
  lateDays: number;
  totalLateMinutes: number;
  avgLateMinutes: number;
  /** Days in the window with at least one punch. */
  workedDays: number;
}

/** Scoreboard payload plus the resolved window it covers. */
export interface TardinessResult {
  data: TardinessEntry[];
  meta: PaginationMeta & { period: TardinessPeriod; from: string; to: string };
}
