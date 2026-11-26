import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { FieldCollection, FieldType } from '@prisma/client';
import { ArrayMaxSize, IsArray, IsBoolean, IsEnum, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

import { FIELD_KEY_MAX_LENGTH } from '../system-fields';

export class CreateFieldDefinitionDTO {
  @ApiProperty({ enum: FieldCollection })
  @IsEnum(FieldCollection)
  collection!: FieldCollection;

  @ApiProperty({ maxLength: FIELD_KEY_MAX_LENGTH, pattern: '^[a-z][a-zA-Z0-9]*$' })
  @IsString()
  @MaxLength(FIELD_KEY_MAX_LENGTH)
  @Matches(/^[a-z][a-zA-Z0-9]*$/, { message: 'key must match ^[a-z][a-zA-Z0-9]*$' })
  key!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(100)
  label!: string;

  @ApiProperty({ enum: FieldType })
  @IsEnum(FieldType)
  type!: FieldType;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  options?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isRequired?: boolean;
}
