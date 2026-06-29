import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsOptional, IsUUID } from 'class-validator';
import { TimesheetEntryStatus } from '@prisma/client';

import { PaginationQueryDTO } from '../../../../common/dto/pagination-query.dto';

export class GetTimesheetEntriesQueryDTO extends PaginationQueryDTO {
  @ApiPropertyOptional({ example: '2026-06-22', format: 'date' })
  @IsOptional()
  @IsDateString()
  periodStart?: string;

  @ApiPropertyOptional({ example: '2026-06-28', format: 'date' })
  @IsOptional()
  @IsDateString()
  periodEnd?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  projectId?: string;

  @ApiPropertyOptional({ enum: TimesheetEntryStatus })
  @IsOptional()
  @IsEnum(TimesheetEntryStatus)
  status?: TimesheetEntryStatus;
}
