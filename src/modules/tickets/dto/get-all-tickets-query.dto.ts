import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsIn, IsOptional, IsString, IsUUID } from 'class-validator';
import { TicketPriority } from '@prisma/client';

import { PaginationQueryDTO } from 'src/common/dto/pagination-query.dto';

export class GetAllTicketsQueryDTO extends PaginationQueryDTO {
  @IsOptional()
  @IsUUID()
  ticketStatusId?: string;

  @IsOptional()
  @IsEnum(TicketPriority)
  priority?: TicketPriority;

  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @IsUUID()
  assigneeId?: string;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  includeArchived?: boolean;

  @IsOptional()
  @IsString()
  sortField?: string;

  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc';
}
