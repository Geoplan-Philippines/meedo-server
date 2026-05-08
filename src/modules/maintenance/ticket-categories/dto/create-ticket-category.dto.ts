import { IsString, IsOptional, MaxLength, IsUUID } from 'class-validator';

export class CreateTicketCategoryDTO {
  @IsString()
  @MaxLength(100)
  name!: string;

  @IsString()
  organizationId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  description!: string;
}