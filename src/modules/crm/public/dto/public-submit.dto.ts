import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsObject, IsOptional, IsString } from 'class-validator';

export class PublicSubmitDTO {
  @ApiProperty({ type: 'object', additionalProperties: true })
  @IsObject()
  values!: Record<string, unknown>;

  @ApiPropertyOptional({ description: 'Honeypot. A non-empty value is accepted and discarded.' })
  @IsOptional()
  @IsString()
  honeypot?: string;
}
