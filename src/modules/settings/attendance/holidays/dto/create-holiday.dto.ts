import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { HolidayType } from '@prisma/client';
import { IsBoolean, IsDateString, IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateHolidayDTO {
  @ApiProperty({ example: 'New Year’s Day', maxLength: 150 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  name!: string;

  @ApiProperty({ example: '2026-01-01', description: 'Holiday date, "YYYY-MM-DD"' })
  @IsDateString()
  date!: string;

  @ApiPropertyOptional({
    enum: HolidayType,
    default: HolidayType.REGULAR,
    example: HolidayType.REGULAR,
  })
  @IsOptional()
  @IsEnum(HolidayType)
  type?: HolidayType;

  @ApiPropertyOptional({
    example: false,
    default: false,
    description: 'Repeats every year on the same month/day',
  })
  @IsOptional()
  @IsBoolean()
  isRecurring?: boolean;
}
