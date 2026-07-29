import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsNumber, IsOptional, IsString, Matches, Max, Min } from 'class-validator';

import { TIME_PATTERN } from '../../shared/attendance-settings.util';

/**
 * Every field is optional — the policy is a single per-org row that is patched.
 * Units are chosen to read plainly: times are "HH:mm", grace/lunch/overtime
 * thresholds are minutes, and standard/overtime work is expressed in hours.
 */
export class UpdateAttendancePolicyDTO {
  @ApiPropertyOptional({ example: 'Asia/Manila', description: 'IANA timezone the org operates in' })
  @IsOptional()
  @IsString()
  timezone?: string;

  @ApiPropertyOptional({ example: true, description: 'Whether open sessions are auto-clocked-out' })
  @IsOptional()
  @IsBoolean()
  autoClockOutEnabled?: boolean;

  @ApiPropertyOptional({ example: '18:00', description: 'Cutoff time for auto-clock-out, "HH:mm"' })
  @IsOptional()
  @Matches(TIME_PATTERN, { message: 'autoClockOutTime must be "HH:mm" between 00:00 and 23:59' })
  autoClockOutTime?: string;

  @ApiPropertyOptional({ example: 8, description: 'Standard paid hours in a work day' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(24)
  standardHoursPerDay?: number;

  @ApiPropertyOptional({ example: 40, description: 'Standard paid hours in a work week' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(168)
  standardHoursPerWeek?: number;

  @ApiPropertyOptional({ example: 24, description: 'Hard cap on hours counted for a single day' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(24)
  maxHoursPerDay?: number;

  @ApiPropertyOptional({ example: 15, description: 'Grace period before an arrival counts as late (minutes)' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(240)
  graceMinutes?: number;

  @ApiPropertyOptional({ example: 60, description: 'Default lunch break length (minutes)' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(480)
  lunchMinutes?: number;

  @ApiPropertyOptional({ example: false, description: 'Whether the lunch break is paid' })
  @IsOptional()
  @IsBoolean()
  lunchIsPaid?: boolean;

  @ApiPropertyOptional({ example: 8, description: 'Overtime starts after this many hours in a day' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(24)
  overtimeAfterHoursPerDay?: number;

  @ApiPropertyOptional({ example: 30, description: 'Smallest overtime block that counts (minutes)' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(480)
  minimumOvertimeMinutes?: number;

  @ApiPropertyOptional({ example: 1.25, description: 'Pay multiplier for overtime hours' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(10)
  overtimeMultiplier?: number;

  @ApiPropertyOptional({ example: 1.3, description: 'Pay multiplier for rest-day work' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(10)
  restDayMultiplier?: number;

  @ApiPropertyOptional({ example: 0.1, description: 'Extra multiplier for night-differential hours' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(10)
  nightDifferentialMultiplier?: number;

  @ApiPropertyOptional({ example: '22:00', description: 'Night differential window start, "HH:mm"' })
  @IsOptional()
  @Matches(TIME_PATTERN, { message: 'nightDifferentialStart must be "HH:mm" between 00:00 and 23:59' })
  nightDifferentialStart?: string;

  @ApiPropertyOptional({ example: '06:00', description: 'Night differential window end, "HH:mm"' })
  @IsOptional()
  @Matches(TIME_PATTERN, { message: 'nightDifferentialEnd must be "HH:mm" between 00:00 and 23:59' })
  nightDifferentialEnd?: string;
}
