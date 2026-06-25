import { IsOptional, Matches } from 'class-validator';

import { PaginationQueryDTO } from 'src/common/dto/pagination-query.dto';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export class GetAttendanceHistoryQueryDTO extends PaginationQueryDTO {
  /** Inclusive lower bound on the attendance day, `YYYY-MM-DD` (local). */
  @IsOptional()
  @Matches(ISO_DATE, { message: 'fromDate must be in YYYY-MM-DD format' })
  fromDate?: string;

  /** Inclusive upper bound on the attendance day, `YYYY-MM-DD` (local). */
  @IsOptional()
  @Matches(ISO_DATE, { message: 'toDate must be in YYYY-MM-DD format' })
  toDate?: string;
}
