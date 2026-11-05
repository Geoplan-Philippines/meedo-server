import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { DISPLAY_NAME_MAX_LENGTH } from '../utils/display-name';

/** Admin edits. Every field is optional; null (or a blank name) clears the value. */
export class UpdateProjectDTO {
  @ApiPropertyOptional({
    nullable: true,
    maxLength: DISPLAY_NAME_MAX_LENGTH,
    description: 'Shown name. null or blank resets to the Apptivo name (quote subject, else WO number).',
  })
  @IsOptional()
  @IsString()
  @MaxLength(DISPLAY_NAME_MAX_LENGTH)
  displayName?: string | null;

  @ApiPropertyOptional({
    nullable: true,
    description: 'Reassign to this client (null = no client). The link is always owned by Meedo.',
  })
  @IsOptional()
  @IsUUID()
  clientId?: string | null;

}
