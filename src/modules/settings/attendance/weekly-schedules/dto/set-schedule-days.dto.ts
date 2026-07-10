import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, ValidateNested } from 'class-validator';

import { WeeklyScheduleDayDTO } from './weekly-schedule-day.dto';

/** Replaces the schedule's whole week in one call (at most one entry per day). */
export class SetScheduleDaysDTO {
  @ApiProperty({ type: [WeeklyScheduleDayDTO] })
  @IsArray()
  @ArrayMaxSize(7)
  @ValidateNested({ each: true })
  @Type(() => WeeklyScheduleDayDTO)
  days!: WeeklyScheduleDayDTO[];
}
