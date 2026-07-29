import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

import { WeeklyScheduleDayDTO } from './weekly-schedule-day.dto';

export class CreateWeeklyScheduleDTO {
  @ApiProperty({ example: 'Standard', description: 'Display name for the schedule', maxLength: 100 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;

  @ApiPropertyOptional({
    example: false,
    default: false,
    description: 'Make this the org default (used when no team/employee override applies)',
  })
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  @ApiPropertyOptional({
    type: [WeeklyScheduleDayDTO],
    description: 'Optional per-weekday setup (at most one entry per day)',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(7)
  @ValidateNested({ each: true })
  @Type(() => WeeklyScheduleDayDTO)
  days?: WeeklyScheduleDayDTO[];
}
