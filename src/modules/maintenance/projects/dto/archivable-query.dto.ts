import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

import { SORT_ORDERS, type SortOrder, trimToUndefined } from '../../../../common/dto/list-query.dto';

export { SORT_ORDERS, type SortOrder };

/** Maintenance lists allow bigger pages than the app-wide 50 so pickers and grouped views load in a few requests. */
export const MAINTENANCE_PAGE_LIMIT_MAX = 200;

/** Pagination, search, sort direction and the opt-in flag for rows archived by the Apptivo sync. */
export class ArchivableQueryDTO {
  @ApiPropertyOptional({ example: 1, minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ example: 10, minimum: 1, maximum: MAINTENANCE_PAGE_LIMIT_MAX, default: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAINTENANCE_PAGE_LIMIT_MAX)
  limit: number = 10;

  @ApiPropertyOptional({ default: false, description: 'Include rows archived because they no longer exist in Apptivo' })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  includeArchived?: boolean;

  @ApiPropertyOptional({ maxLength: 100, description: 'Case-insensitive search' })
  @IsOptional()
  @Transform(trimToUndefined)
  @IsString()
  @MaxLength(100)
  search?: string;

  @ApiPropertyOptional({ enum: SORT_ORDERS, default: 'asc' })
  @IsOptional()
  @IsIn(SORT_ORDERS)
  sortOrder?: SortOrder;
}
