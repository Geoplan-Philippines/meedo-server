import { IsIn, IsOptional, IsString, Matches } from 'class-validator';

import { PaginationQueryDTO } from 'src/common/dto/pagination-query.dto';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Scoreboard window relative to the anchor date. */
export const TARDINESS_PERIODS = ['daily', 'weekly', 'monthly'] as const;
export type TardinessPeriod = (typeof TARDINESS_PERIODS)[number];

export class GetTardinessQueryDTO extends PaginationQueryDTO {
  /** Anchor date, `YYYY-MM-DD` (local). The period is computed around it. Defaults to today. */
  @IsOptional()
  @Matches(ISO_DATE, { message: 'date must be in YYYY-MM-DD format' })
  date?: string;

  /** Window: the day, the Monday-Sunday week, or the calendar month of the anchor. */
  @IsOptional()
  @IsIn(TARDINESS_PERIODS)
  period: TardinessPeriod = 'weekly';

  /** Free-text match on employee name, email, or employee code. */
  @IsOptional()
  @IsString()
  search?: string;
}
