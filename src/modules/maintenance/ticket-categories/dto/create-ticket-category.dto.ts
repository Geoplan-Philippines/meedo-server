import { IsString, IsOptional, IsNotEmpty, MaxLength } from 'class-validator';

export class CreateTicketCategoryDTO {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string;
}