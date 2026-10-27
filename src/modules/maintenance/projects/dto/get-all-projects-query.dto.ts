import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { ArchivableQueryDTO } from './archivable-query.dto';

export const PROJECT_SORT_FIELDS = ['workOrderNumber', 'quoteSubject', 'reportedDate', 'total', 'status', 'createdAt'] as const;
export type ProjectSortField = (typeof PROJECT_SORT_FIELDS)[number];

export class GetAllProjectsQueryDTO extends ArchivableQueryDTO {
  @ApiPropertyOptional({ description: 'Filter by client ID' })
  @IsOptional()
  @IsUUID()
  clientId?: string;

  @ApiPropertyOptional({ default: false, description: 'Only projects with no client (the "Unassigned" group); overrides clientId' })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  unassigned?: boolean;

  @ApiPropertyOptional({
    description:
      'Dept (team) filter: projects with at least one non-archived ticket for this team. Projects carry no team of their own; tickets are the only team link.',
  })
  @IsOptional()
  @IsUUID()
  teamId?: string;

  @ApiPropertyOptional({ description: 'Filter by Apptivo status, e.g. "Completed"', maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  status?: string;

  @ApiPropertyOptional({ enum: PROJECT_SORT_FIELDS, default: 'createdAt' })
  @IsOptional()
  @IsIn(PROJECT_SORT_FIELDS)
  sortField?: ProjectSortField;
}
