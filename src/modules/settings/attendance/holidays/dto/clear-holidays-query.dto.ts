import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, Max, Min } from 'class-validator';

/** Year is required here so a bulk delete can never wipe every year by omission. */
export class ClearHolidaysQueryDTO {
  @ApiProperty({ example: 2026, description: 'Delete every holiday in this year' })
  @Type(() => Number)
  @IsInt()
  @Min(1970)
  @Max(2100)
  year!: number;
}
