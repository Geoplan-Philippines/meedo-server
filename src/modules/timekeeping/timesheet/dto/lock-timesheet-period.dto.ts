import { ApiProperty } from '@nestjs/swagger';
import { IsDateString } from 'class-validator';

export class LockTimesheetPeriodDTO {
  @ApiProperty({ example: '2026-06-22', format: 'date' })
  @IsDateString()
  periodStart!: string;

  @ApiProperty({ example: '2026-06-28', format: 'date' })
  @IsDateString()
  periodEnd!: string;
}
