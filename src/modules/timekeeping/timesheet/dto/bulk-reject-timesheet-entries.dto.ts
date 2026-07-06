import { ApiProperty } from '@nestjs/swagger';
import { ArrayMinSize, IsArray, IsNotEmpty, IsString, IsUUID, MaxLength } from 'class-validator';

export class BulkRejectTimesheetEntriesDTO {
  @ApiProperty({ type: [String], format: 'uuid', minItems: 1, example: ['4f96e8c9-98f4-4b27-a780-fb7261e55c98'] })
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID(undefined, { each: true })
  entryIds!: string[];

  @ApiProperty({ example: 'Please add a more specific task description.', maxLength: 1000 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  reason!: string;
}
