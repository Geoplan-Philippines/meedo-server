import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { TimesheetEntryStatus } from '@prisma/client';

export class GetTimesheetSummaryQueryDTO {
  @ApiProperty({ example: '2026-06-22', format: 'date' })
  @IsDateString()
  periodStart!: string;

  @ApiProperty({ example: '2026-06-28', format: 'date' })
  @IsDateString()
  periodEnd!: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  userId?: string;

  @ApiPropertyOptional({ example: 'employee@example.com', maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  employee?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  workOrderId?: string;

  @ApiPropertyOptional({ example: 'WO-001', maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  tag?: string;

  @ApiPropertyOptional({ enum: TimesheetEntryStatus })
  @IsOptional()
  @IsEnum(TimesheetEntryStatus)
  status?: TimesheetEntryStatus;
}
