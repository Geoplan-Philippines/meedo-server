import { ApiPropertyOptional } from '@nestjs/swagger';
import { SubscriberStatus } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsIn, IsOptional } from 'class-validator';

import { ListQueryDTO, toBoolean } from 'src/common/dto/list-query.dto';

export const SUBSCRIBER_SORT_FIELDS = ['createdAt', 'email', 'name'] as const;
export type SubscriberSortField = (typeof SUBSCRIBER_SORT_FIELDS)[number];

/** Search matches email and name; every word must match. */
export class GetAllSubscribersQueryDTO extends ListQueryDTO {
  @ApiPropertyOptional({ enum: SUBSCRIBER_SORT_FIELDS, default: 'createdAt' })
  @IsOptional()
  @IsIn(SUBSCRIBER_SORT_FIELDS)
  sortField?: SubscriberSortField;

  @ApiPropertyOptional({ enum: SubscriberStatus })
  @IsOptional()
  @IsEnum(SubscriberStatus)
  status?: SubscriberStatus;

  @ApiPropertyOptional({ type: Boolean, default: false, description: 'When true, list only archived subscribers.' })
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  isArchived?: boolean;
}
