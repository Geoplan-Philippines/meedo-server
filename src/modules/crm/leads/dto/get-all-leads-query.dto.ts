import { ApiPropertyOptional } from '@nestjs/swagger';
import { LeadStatus } from '@prisma/client';
import { IsEnum, IsIn, IsOptional } from 'class-validator';

import { ListQueryDTO } from 'src/common/dto/list-query.dto';

export const LEAD_SORT_FIELDS = ['createdAt', 'firstName', 'lastName', 'email', 'company', 'phoneNumber', 'status'] as const;
export type LeadSortField = (typeof LEAD_SORT_FIELDS)[number];

/** Search matches first name, last name, email and company; every word must match. */
export class GetAllLeadsQueryDTO extends ListQueryDTO {
  @ApiPropertyOptional({ enum: LEAD_SORT_FIELDS, default: 'createdAt' })
  @IsOptional()
  @IsIn(LEAD_SORT_FIELDS)
  sortField?: LeadSortField;

  @ApiPropertyOptional({ enum: LeadStatus })
  @IsOptional()
  @IsEnum(LeadStatus)
  status?: LeadStatus;
}
