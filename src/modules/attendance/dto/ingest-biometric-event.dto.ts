import { IsDateString, IsNotEmpty, IsString, MaxLength } from 'class-validator';

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
