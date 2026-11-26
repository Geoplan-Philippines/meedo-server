import { Transform } from 'class-transformer';
import { IsEmail, IsOptional, IsString, MaxLength } from 'class-validator';

import { lowercaseEmail } from '../../../crm.constants';

export class CreateSubscriberDTO {
  @Transform(lowercaseEmail)
  @IsEmail()
  email!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;
}
