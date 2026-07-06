import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsNotEmpty,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export class IngestBiometricEventDTO {
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  externalId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(32)
  biometricsId!: string;

  @IsDateString()
  timestamp!: string;
}

export class IngestBiometricEventsDTO {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => IngestBiometricEventDTO)
  events!: IngestBiometricEventDTO[];
}
