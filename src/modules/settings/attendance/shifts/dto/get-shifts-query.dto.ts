import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsOptional } from 'class-validator';

import { ListQueryDTO, toBoolean } from '../../../../../common/dto/list-query.dto';

export const SHIFT_SORT_FIELDS = ['startTime', 'name', 'createdAt'] as const;
export type ShiftSortField = (typeof SHIFT_SORT_FIELDS)[number];

/** Search matches the shift name. Active shifts always list before archived ones. */
export class GetShiftsQueryDTO extends ListQueryDTO {
  @ApiPropertyOptional({ enum: SHIFT_SORT_FIELDS, default: 'startTime' })
  @IsOptional()
  @IsIn(SHIFT_SORT_FIELDS)
  sortField?: ShiftSortField;

  @ApiPropertyOptional({ default: true, description: 'false leaves archived shifts out' })
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  includeArchived?: boolean;
}
