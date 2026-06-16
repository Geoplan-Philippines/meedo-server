import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsIn, IsOptional, IsString, IsUUID } from 'class-validator';
import { TicketPriority } from '@prisma/client';

import { PaginationQueryDTO } from 'src/common/dto/pagination-query.dto';
import { TICKET_SORTABLE_FIELDS, type TicketSortField } from '../constants/ticket.constants';

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
  @IsIn(TICKET_SORTABLE_FIELDS)
  sortField?: TicketSortField;

  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc';
}
