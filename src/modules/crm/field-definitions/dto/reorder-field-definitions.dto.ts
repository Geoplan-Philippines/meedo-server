import { ApiProperty } from '@nestjs/swagger';
import { FieldCollection } from '@prisma/client';
import { ArrayMinSize, IsArray, IsEnum, IsUUID } from 'class-validator';

export class ReorderFieldDefinitionsDTO {
  @ApiProperty({ enum: FieldCollection })
  @IsEnum(FieldCollection)
  collection!: FieldCollection;

  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('4', { each: true })
  orderedIds!: string[];
}
