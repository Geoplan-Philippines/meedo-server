import { IsString, IsNotEmpty, IsOptional, IsIn, IsEnum } from 'class-validator';
import { TicketStatusCategory } from '@prisma/client';
import { CUSTOM_STATUS_COLORS } from '../../../../common/constants/statuses.constants';

export class CreateStatusDTO {
  @IsString()
  @IsNotEmpty()
  name!: string;

  // Custom statuses are restricted to the curated palette — no free-form colors.
  @IsOptional()
  @IsIn([...CUSTOM_STATUS_COLORS])
  color?: string;

  @IsOptional()
  @IsEnum(TicketStatusCategory)
  category?: TicketStatusCategory;
}
