import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';

import { ListQueryDTO } from 'src/common/dto/list-query.dto';

export const SUBSCRIBER_SORT_FIELDS = ['createdAt', 'email', 'name'] as const;
export type SubscriberSortField = (typeof SUBSCRIBER_SORT_FIELDS)[number];

/** Search matches email and name; every word must match. */
export class GetAllSubscribersQueryDTO extends ListQueryDTO {
  @ApiPropertyOptional({ enum: SUBSCRIBER_SORT_FIELDS, default: 'createdAt' })
  @IsOptional()
  @IsIn(SUBSCRIBER_SORT_FIELDS)
  sortField?: SubscriberSortField;
}
