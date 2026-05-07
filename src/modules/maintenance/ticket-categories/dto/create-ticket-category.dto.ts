import { IsString, IsOptional, MaxLength, IsUUID } from 'class-validator';

export class CreateTicketCategoryDTO {
  @IsString()
  @MaxLength(100)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  description!: string;


  //temp
  @IsString()
  organizationId!: string;
}