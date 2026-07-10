import { IsEmail, IsIn, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

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

  /** Weekly schedule to assign this employee (org attendance settings). */
  @IsOptional()
  @IsUUID()
  weeklyScheduleId?: string;

  @IsOptional()
  @IsIn(['member', 'admin', 'owner'])
  role?: OnboardMemberRole;
}
