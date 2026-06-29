import { IsEmail, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export type OnboardMemberRole = 'member' | 'admin' | 'owner';

export class OnboardMemberDTO {
  @IsString()
  @MaxLength(100)
  name!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password!: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  employeeCode?: string;

  /** Hikvision device employee number, used to match biometric taps to this user. */
  @IsOptional()
  @IsString()
  @MaxLength(50)
  biometricsId?: string;

  @IsOptional()
  @IsString()
  teamId?: string;

  @IsOptional()
  @IsIn(['member', 'admin', 'owner'])
  role?: OnboardMemberRole;
}
