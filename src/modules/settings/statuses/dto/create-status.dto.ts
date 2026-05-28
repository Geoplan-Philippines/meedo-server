import { IsString, IsNotEmpty, IsOptional, IsHexColor } from 'class-validator';

export class CreateStatusDTO {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsOptional()
  @IsHexColor()
  color?: string;
}
