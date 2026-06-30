import {
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

import type { OnboardMemberRole } from './onboard-member.dto';

export class UpdateMemberDTO {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  employeeCode?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  biometricsId?: string | null;

  @IsOptional()
  @IsString()
  teamId?: string | null;

  @IsOptional()
  @IsIn(['member', 'admin', 'owner'])
  role?: OnboardMemberRole;
}
