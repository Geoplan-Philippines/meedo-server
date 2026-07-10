import { IsIn, IsOptional, IsString, Matches } from 'class-validator';

import { PaginationQueryDTO } from 'src/common/dto/pagination-query.dto';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** The status buckets the board can filter by (maps many day statuses onto a few). */
export const BOARD_STATUS_FILTERS = ['present', 'late', 'absent', 'upcoming', 'off'] as const;
export type BoardStatusFilter = (typeof BOARD_STATUS_FILTERS)[number];

export class GetBoardRosterQueryDTO extends PaginationQueryDTO {
  /** The attendance day to view, `YYYY-MM-DD` (local). Defaults to today. */
  @IsOptional()
  @Matches(ISO_DATE, { message: 'date must be in YYYY-MM-DD format' })
  date?: string;

  /** Free-text match on employee name, email, or employee code. */
  @IsOptional()
  @IsString()
  search?: string;

  /** Narrow the roster to a single status bucket (from a summary card). */
  @IsOptional()
  @IsIn(BOARD_STATUS_FILTERS)
  status?: BoardStatusFilter;
}
