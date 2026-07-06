import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsOptional, IsUUID } from 'class-validator';
import { TimesheetAuditAction } from '@prisma/client';

import { PaginationQueryDTO } from '../../../../common/dto/pagination-query.dto';

export class GetTimesheetAuditLogsQueryDTO extends PaginationQueryDTO {
  @ApiPropertyOptional({ enum: TimesheetAuditAction })
  @IsOptional()
  @IsEnum(TimesheetAuditAction)
  action?: TimesheetAuditAction;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  targetUserId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  timesheetEntryId?: string;

  @ApiPropertyOptional({ example: '2026-06-22', format: 'date' })
  @IsOptional()
  @IsDateString()
  periodStart?: string;

  @ApiPropertyOptional({ example: '2026-06-28', format: 'date' })
  @IsOptional()
  @IsDateString()
  periodEnd?: string;
}
