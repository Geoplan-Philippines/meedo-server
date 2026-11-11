import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsDateString, IsEnum, IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID, Matches, MaxLength } from 'class-validator';
import { TimesheetWorkType } from '@prisma/client';
import { TIMESHEET_DESCRIPTION_MAX_LENGTH } from '../timesheet-entry.constants';

export class CreateTimesheetEntryDTO {
  @ApiPropertyOptional({ format: 'uuid', nullable: true, description: 'Optional project; a ticket determines its project.' })
  @IsOptional() @IsUUID()
  projectId?: string | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @IsOptional() @IsUUID()
  ticketId?: string | null;

  @ApiPropertyOptional({ maxLength: TIMESHEET_DESCRIPTION_MAX_LENGTH, description: 'Required without a ticket; legacy task is accepted as a fallback.' })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value)
  @IsString() @IsNotEmpty() @MaxLength(TIMESHEET_DESCRIPTION_MAX_LENGTH)
  description?: string;

  @ApiProperty({ example: '2026-06-22', format: 'date' })
  @IsDateString() @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'workDate must be a calendar date (YYYY-MM-DD).' })
  workDate!: string;

  @ApiPropertyOptional({ example: 8, minimum: 1, maximum: 9, description: 'Required unless workType is LEAVE.' })
  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 })
  hours?: number;

  @ApiPropertyOptional({ example: 'OFC - DW', maxLength: 100 })
  @IsOptional() @IsString() @MaxLength(100)
  location?: string;

  @ApiPropertyOptional({ enum: TimesheetWorkType })
  @IsOptional() @IsEnum(TimesheetWorkType)
  workType?: TimesheetWorkType;

  @ApiPropertyOptional({ maxLength: 1000, description: 'Legacy task field; retained for existing clients and entries.' })
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(1000)
  task?: string;

  @ApiPropertyOptional({ maxLength: 1000 })
  @IsOptional() @IsString() @MaxLength(1000)
  projectDescription?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional() @IsBoolean()
  isOvertime?: boolean;

  @ApiPropertyOptional({ default: false })
  @IsOptional() @IsBoolean()
  isNightDifferential?: boolean;
}
