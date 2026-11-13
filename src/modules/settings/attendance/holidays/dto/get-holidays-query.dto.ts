import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';

import { ListQueryDTO } from '../../../../../common/dto/list-query.dto';

export const HOLIDAY_SORT_FIELDS = ['date', 'name'] as const;
export type HolidaySortField = (typeof HOLIDAY_SORT_FIELDS)[number];

/** Search matches the holiday name. */
export class GetHolidaysQueryDTO extends ListQueryDTO {
  @ApiPropertyOptional({ example: 2026, description: 'Only return holidays in this year' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1970)
  @Max(2100)
  year?: number;

  @ApiPropertyOptional({ enum: HOLIDAY_SORT_FIELDS, default: 'date' })
  @IsOptional()
  @IsIn(HOLIDAY_SORT_FIELDS)
  sortField?: HolidaySortField;
}
