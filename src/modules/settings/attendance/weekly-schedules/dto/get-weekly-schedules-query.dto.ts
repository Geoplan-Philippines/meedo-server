import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';

import { ListQueryDTO } from '../../../../../common/dto/list-query.dto';

export const WEEKLY_SCHEDULE_SORT_FIELDS = ['name', 'createdAt'] as const;
export type WeeklyScheduleSortField = (typeof WEEKLY_SCHEDULE_SORT_FIELDS)[number];

/** Search matches the schedule name. The default schedule always lists first. */
export class GetWeeklySchedulesQueryDTO extends ListQueryDTO {
  @ApiPropertyOptional({ enum: WEEKLY_SCHEDULE_SORT_FIELDS, default: 'name' })
  @IsOptional()
  @IsIn(WEEKLY_SCHEDULE_SORT_FIELDS)
  sortField?: WeeklyScheduleSortField;
}
