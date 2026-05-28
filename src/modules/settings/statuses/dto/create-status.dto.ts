import { IsString, IsNotEmpty, IsOptional, IsHexColor, IsUUID } from 'class-validator';

export class CreateStatusDTO {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsOptional()
  @IsHexColor()
  color?: string;

  @IsUUID()
  organizationId!: string;
}
