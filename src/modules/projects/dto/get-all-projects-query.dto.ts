import { ApiPropertyOptional } from '@nestjs/swagger';
import { ProjectState, TicketPriority } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsIn, IsOptional, IsString, IsUUID } from 'class-validator';

import { PaginationQueryDTO } from 'src/common/dto/pagination-query.dto';
import { toStringArray } from 'src/common/transforms/to-string-array.transform';
import { PROJECT_SORTABLE_FIELDS, type ProjectSortField } from '../constants/project.constants';

export class GetAllProjectsQueryDTO extends PaginationQueryDTO {
  @ApiPropertyOptional({ enum: ProjectState, isArray: true })
  @IsOptional()
  @Transform(toStringArray)
  @IsEnum(ProjectState, { each: true })
  state?: ProjectState[];

  @ApiPropertyOptional({ enum: TicketPriority, isArray: true })
  @IsOptional()
  @Transform(toStringArray)
  @IsEnum(TicketPriority, { each: true })
  priority?: TicketPriority[];

  @ApiPropertyOptional({ description: 'Filter to projects led by this member' })
  @IsOptional()
  @IsUUID()
  leadMemberId?: string;

  @ApiPropertyOptional({ description: 'Filter to projects this member belongs to' })
  @IsOptional()
  @IsUUID()
  memberId?: string;

  @ApiPropertyOptional({ description: 'Matches project name, key or description' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  includeArchived?: boolean;

  @ApiPropertyOptional({ enum: PROJECT_SORTABLE_FIELDS })
  @IsOptional()
  @IsIn(PROJECT_SORTABLE_FIELDS)
  sortField?: ProjectSortField;

  @ApiPropertyOptional({ enum: ['asc', 'desc'] })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc';
}
