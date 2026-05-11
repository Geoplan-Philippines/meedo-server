import { IsBoolean, IsDateString, IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
import { FaceProfileStatus } from '@prisma/client';

export class CreateFaceProfileDTO {
  @IsString()
  organizationId!: string;

  @IsString()
  userId!: string;
  
  @IsOptional()
  @IsEnum(FaceProfileStatus)
  status?: FaceProfileStatus;

  @IsOptional()
  @IsBoolean()
  isArchived!: boolean;

  @IsOptional()
  @IsDateString()
  enrolledAt?: Date;

  @IsOptional()
  @IsDateString()
  disabledAt?: Date
}
