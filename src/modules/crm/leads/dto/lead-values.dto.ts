import { ApiProperty } from '@nestjs/swagger';
import { IsObject } from 'class-validator';

export class LeadValuesDTO {
  @ApiProperty({ type: 'object', additionalProperties: true })
  @IsObject()
  values!: Record<string, unknown>;
}
