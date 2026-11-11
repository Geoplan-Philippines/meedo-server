import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { DISPLAY_NAME_MAX_LENGTH } from '../../projects/utils/display-name';

export class UpdateClientDTO {
  @ApiPropertyOptional({
    nullable: true,
    maxLength: DISPLAY_NAME_MAX_LENGTH,
    description: 'Shown name. null or blank resets to the Apptivo customer name.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(DISPLAY_NAME_MAX_LENGTH)
  displayName?: string | null;
}
