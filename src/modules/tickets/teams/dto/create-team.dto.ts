import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateTeamDTO {

  @IsString()
  @MaxLength(100)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string;
}