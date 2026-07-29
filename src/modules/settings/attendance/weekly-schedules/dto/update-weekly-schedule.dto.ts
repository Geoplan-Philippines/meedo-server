import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

/** Rename or (de)activate a schedule. Days are managed via `PUT :id/days` and the
 *  default flag via `PATCH :id/default`, so they are intentionally not here. */
export class UpdateWeeklyScheduleDTO {
  @ApiPropertyOptional({ example: 'Standard', maxLength: 100 })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
