import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsHexColor,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  Validate,
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

import { TIME_PATTERN, hhmmToMinutes } from '../../shared/attendance-settings.util';

/** `endTime` must be later than `startTime`, unless the shift runs past midnight. */
@ValidatorConstraint({ name: 'EndAfterStartUnlessOvernight' })
class EndAfterStartUnlessOvernightConstraint implements ValidatorConstraintInterface {
  validate(_: unknown, args: ValidationArguments): boolean {
    const dto = args.object as CreateShiftDTO;
    if (!dto.startTime || !dto.endTime) return true;
    if (!TIME_PATTERN.test(dto.startTime) || !TIME_PATTERN.test(dto.endTime)) return true;
    if (dto.crossesMidnight) return true;
    return hhmmToMinutes(dto.endTime) > hhmmToMinutes(dto.startTime);
  }

  defaultMessage(): string {
    return 'endTime must be later than startTime (set crossesMidnight for overnight shifts)';
  }
}

export class CreateShiftDTO {
  @ApiProperty({ example: 'Regular', description: 'Display name for the shift', maxLength: 100 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;

  @ApiProperty({ example: '08:00', description: 'Start time, 24-hour "HH:mm"' })
  @IsString()
  @Matches(TIME_PATTERN, { message: 'startTime must be "HH:mm" between 00:00 and 23:59' })
  startTime!: string;

  @ApiProperty({ example: '17:00', description: 'End time, 24-hour "HH:mm"' })
  @IsString()
  @Matches(TIME_PATTERN, { message: 'endTime must be "HH:mm" between 00:00 and 23:59' })
  @Validate(EndAfterStartUnlessOvernightConstraint)
  endTime!: string;

  @ApiPropertyOptional({ example: 60, default: 60, description: 'Unpaid break length in minutes' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(480)
  breakMinutes?: number;

  @ApiPropertyOptional({
    example: 15,
    description: 'Late grace in minutes for this shift; overrides the org policy when set',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(240)
  graceMinutes?: number;

  @ApiPropertyOptional({
    example: false,
    default: false,
    description: 'True for overnight shifts whose end time falls on the next day',
  })
  @IsOptional()
  @IsBoolean()
  crossesMidnight?: boolean;

  @ApiPropertyOptional({
    example: false,
    default: false,
    description: 'Flexible shift: start time is nominal and lateness is not tracked',
  })
  @IsOptional()
  @IsBoolean()
  isFlexible?: boolean;

  @ApiPropertyOptional({ example: '#6B7280', description: 'Hex color used to render the shift' })
  @IsOptional()
  @IsHexColor()
  color?: string;
}
