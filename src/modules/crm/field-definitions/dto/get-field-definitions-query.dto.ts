import { ApiProperty } from '@nestjs/swagger';
import { FieldCollection } from '@prisma/client';
import { IsEnum } from 'class-validator';

export class GetFieldDefinitionsQueryDTO {
  @ApiProperty({ enum: FieldCollection })
  @IsEnum(FieldCollection)
  collection!: FieldCollection;
}
