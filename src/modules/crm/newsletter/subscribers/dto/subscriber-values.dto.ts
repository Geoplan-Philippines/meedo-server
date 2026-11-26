import { ApiProperty } from '@nestjs/swagger';
import { IsObject } from 'class-validator';

export class SubscriberValuesDTO {
  @ApiProperty({ type: 'object', additionalProperties: true })
  @IsObject()
  values!: Record<string, unknown>;
}
