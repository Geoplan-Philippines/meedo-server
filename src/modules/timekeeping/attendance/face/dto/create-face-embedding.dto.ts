import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsEnum, IsNumber, IsOptional, IsString, IsUrl } from 'class-validator';
import { FaceEmbeddingModel, FaceEmbeddingProvider } from '@prisma/client';

export class CreateFaceEmbeddingDTO {
  @IsString()
  organizationId!: string;

  @IsString()
  faceProfileId!: string;

  @IsArray()
  @ArrayMinSize(512)
  @ArrayMaxSize(512)
  @IsNumber({}, { each: true })
  embedding!: number[];

  @IsOptional()
  @IsEnum(FaceEmbeddingProvider)
  provider?: FaceEmbeddingProvider;

  @IsEnum(FaceEmbeddingModel)
  model!: FaceEmbeddingModel;
  
  @IsOptional()
  @IsUrl({ require_tld: false })
  imageUrl?: string;

  @IsOptional()
  @IsNumber()
  qualityScore?: number;

  @IsOptional()
  @IsBoolean()
  isArchived?: boolean;
}
