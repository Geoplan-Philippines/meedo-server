import { IsEmail, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateLeadDTO {
  @IsString()
  @MaxLength(100)
  firstName!: string;

  @IsString()
  @MaxLength(100)
  lastName!: string;

  @IsEmail()
  email!: string;

  @IsOptional()
  @MaxLength(20)
  phoneNumber!: string;

  @IsString()
  message!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  company?: string;
}
