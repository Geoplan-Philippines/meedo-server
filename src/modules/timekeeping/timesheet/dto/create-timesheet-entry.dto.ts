import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { TimesheetWorkType } from '@prisma/client';

export class CreateTimesheetEntryDTO {
  @ApiProperty({ format: 'uuid', description: 'Project/work-order id from the active organization.' })
  @IsUUID()
  projectId!: string;

  @ApiProperty({ example: '2026-06-22', format: 'date' })
  @IsDateString()
  workDate!: string;

  @ApiPropertyOptional({ example: 8, minimum: 1, maximum: 9, description: 'Required unless workType is LEAVE.' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  hours?: number;

  @ApiPropertyOptional({ example: 'OFC - DW', maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  location?: string;

  @ApiPropertyOptional({ enum: TimesheetWorkType, example: TimesheetWorkType.REGULAR })
  @IsOptional()
  @IsEnum(TimesheetWorkType)
  workType?: TimesheetWorkType;

  @ApiProperty({ example: 'Prepared weekly site inspection report.', maxLength: 1000 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  task!: string;

  @ApiPropertyOptional({ example: 'Internal QA support for WO-001.', maxLength: 1000 })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  projectDescription?: string;

  @ApiPropertyOptional({ example: false, default: false })
  @IsOptional()
  @IsBoolean()
  isOvertime?: boolean;

  @ApiPropertyOptional({ example: false, default: false })
  @IsOptional()
  @IsBoolean()
  isNightDifferential?: boolean;
}
