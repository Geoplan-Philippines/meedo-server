import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class UnlockTimesheetPeriodDTO {
  @ApiProperty({ example: '2026-06-22', format: 'date' })
  @IsDateString()
  periodStart!: string;

  @ApiProperty({ example: '2026-06-28', format: 'date' })
  @IsDateString()
  periodEnd!: string;

  @ApiProperty({ example: 'Correction window for missed employee entries.', maxLength: 1000 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  reason!: string;
}
