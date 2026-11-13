import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsOptional } from 'class-validator';

import { ListQueryDTO, toBoolean } from '../../../../common/dto/list-query.dto';

/** `position`: standard statuses in their workflow order, then custom ones oldest first. */
export const STATUS_SORT_FIELDS = ['position', 'name', 'createdAt'] as const;
export type StatusSortField = (typeof STATUS_SORT_FIELDS)[number];

/** Search matches the status name. */
export class GetStatusesQueryDTO extends ListQueryDTO {
  @ApiPropertyOptional({ enum: STATUS_SORT_FIELDS, default: 'position' })
  @IsOptional()
  @IsIn(STATUS_SORT_FIELDS)
  sortField?: StatusSortField;

  @ApiPropertyOptional({ description: 'true: standard statuses only; false: custom statuses only' })
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  isSystem?: boolean;

  @ApiPropertyOptional({ default: true, description: 'false leaves archived statuses out' })
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  includeArchived?: boolean;
}
