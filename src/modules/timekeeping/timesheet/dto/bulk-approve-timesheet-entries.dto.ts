import { ApiProperty } from '@nestjs/swagger';
import { ArrayMinSize, IsArray, IsUUID } from 'class-validator';

export class BulkApproveTimesheetEntriesDTO {
  @ApiProperty({ type: [String], format: 'uuid', minItems: 1, example: ['4f96e8c9-98f4-4b27-a780-fb7261e55c98'] })
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID(undefined, { each: true })
  entryIds!: string[];
}
