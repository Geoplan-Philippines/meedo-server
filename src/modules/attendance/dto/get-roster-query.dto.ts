import { IsOptional, IsString, Matches } from 'class-validator';

import { PaginationQueryDTO } from 'src/common/dto/pagination-query.dto';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export class GetRosterQueryDTO extends PaginationQueryDTO {
  /** The attendance day to view, `YYYY-MM-DD` (local). Defaults to today. */
  @IsOptional()
  @Matches(ISO_DATE, { message: 'date must be in YYYY-MM-DD format' })
  date?: string;

  /** Free-text match on employee name, email, or employee code. */
  @IsOptional()
  @IsString()
  search?: string;
}
