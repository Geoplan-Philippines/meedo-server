import { TicketPriority } from '@prisma/client';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsUrl,
  IsNotEmpty,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  MaxLength,
  Validate,
  ValidatorConstraint,
  ValidatorConstraintInterface,
  ValidationArguments,
} from 'class-validator';

@ValidatorConstraint({ name: 'ResolutionGtFirstResponse' })
class ResolutionGtFirstResponseConstraint implements ValidatorConstraintInterface {
  validate(_: unknown, args: ValidationArguments): boolean {
    const obj = args.object as CreateSlaPolicyDTO;
    if (obj.resolutionMinutes == null || obj.firstResponseMinutes == null) return true;
    return obj.resolutionMinutes > obj.firstResponseMinutes;
  }

  defaultMessage(): string {
    return 'resolutionMinutes must be greater than firstResponseMinutes';
  }
}

export class CreateSlaPolicyDTO {
  @ApiProperty({ example: 'Standard SLA', maxLength: 150 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  name!: string;

  @ApiProperty({ enum: TicketPriority, example: TicketPriority.HIGH })
  @IsEnum(TicketPriority)
  priority!: TicketPriority;

  @ApiProperty({ example: 60, description: 'First response time in minutes' })
  @IsInt()
  @IsPositive()
  firstResponseMinutes!: number;

  @ApiProperty({ example: 480, description: 'Resolution time in minutes. Must be greater than firstResponseMinutes' })
  @IsInt()
  @IsPositive()
  @Validate(ResolutionGtFirstResponseConstraint)
  resolutionMinutes!: number;

  @ApiPropertyOptional({ example: false, default: false })
  @IsOptional()
  @IsBoolean()
  businessHoursOnly?: boolean;

  @ApiPropertyOptional({ example: 'https://example.com/sla-document.pdf', maxLength: 500 })
  @IsOptional()
  @IsUrl()
  @MaxLength(500)
  documentUrl?: string;

  @ApiPropertyOptional({
    description: 'Work order this policy applies to. Omit for the organization-wide default.',
    example: 'e9836a5c-0c38-4dcb-b2fe-1366ff9f1a6c',
  })
  @IsOptional()
  @IsUUID()
  workOrderId?: string;
}
