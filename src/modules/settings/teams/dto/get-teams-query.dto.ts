import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsOptional } from 'class-validator';

import { ListQueryDTO, toBoolean } from '../../../../common/dto/list-query.dto';

export const TEAM_SORT_FIELDS = ['name', 'createdAt', 'memberCount'] as const;
export type TeamSortField = (typeof TEAM_SORT_FIELDS)[number];

/** Search matches the team name. */
export class GetTeamsQueryDTO extends ListQueryDTO {
  @ApiPropertyOptional({ enum: TEAM_SORT_FIELDS, default: 'name' })
  @IsOptional()
  @IsIn(TEAM_SORT_FIELDS)
  sortField?: TeamSortField;

  @ApiPropertyOptional({ default: false, description: 'Only teams the caller belongs to' })
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  mine?: boolean;
}
