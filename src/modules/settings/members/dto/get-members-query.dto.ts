import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsUUID } from 'class-validator';

import { ListQueryDTO } from '../../../../common/dto/list-query.dto';

export const MEMBER_SORT_FIELDS = ['name', 'email', 'role', 'createdAt'] as const;
export type MemberSortField = (typeof MEMBER_SORT_FIELDS)[number];

export const MEMBER_ROLES = ['member', 'admin', 'owner'] as const;

/** Search matches member name and email; every word must match. */
export class GetMembersQueryDTO extends ListQueryDTO {
  @ApiPropertyOptional({ enum: MEMBER_SORT_FIELDS, default: 'name' })
  @IsOptional()
  @IsIn(MEMBER_SORT_FIELDS)
  sortField?: MemberSortField;

  @ApiPropertyOptional({ description: 'Only members assigned to this team' })
  @IsOptional()
  @IsUUID()
  teamId?: string;

  @ApiPropertyOptional({ enum: MEMBER_ROLES })
  @IsOptional()
  @IsIn(MEMBER_ROLES)
  role?: (typeof MEMBER_ROLES)[number];
}
