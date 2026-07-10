import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AttendanceSource, DayOfWeek } from '@prisma/client';
import { IsBoolean, IsEnum, IsOptional, IsUUID } from 'class-validator';

/**
 * One weekday of a weekly schedule. A working day references a `shiftId` (its
 * hours) and may set an expected work mode; a rest day (`isWorkingDay: false`)
 * carries neither. These cross-field rules are enforced in the service so the
 * shift can also be checked against the organization.
 */
export class WeeklyScheduleDayDTO {
  @ApiProperty({ enum: DayOfWeek, example: DayOfWeek.MONDAY })
  @IsEnum(DayOfWeek)
  dayOfWeek!: DayOfWeek;

  @ApiProperty({ example: true, description: 'False marks the day as a rest day' })
  @IsBoolean()
  isWorkingDay!: boolean;

  @ApiPropertyOptional({
    enum: AttendanceSource,
    example: AttendanceSource.OFFICE,
    description: 'Expected work mode for the day (Office/Field/WFH)',
  })
  @IsOptional()
  @IsEnum(AttendanceSource)
  expectedSource?: AttendanceSource;

  @ApiPropertyOptional({ description: 'Shift worked on this day; required for a working day' })
  @IsOptional()
  @IsUUID()
  shiftId?: string;

  @ApiPropertyOptional({
    default: true,
    description: 'When false, lateness is not recorded for this day (e.g. a flexible WFH day)',
  })
  @IsOptional()
  @IsBoolean()
  trackLateness?: boolean;
}
