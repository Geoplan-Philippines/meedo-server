import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsIn, IsOptional, IsString, IsUUID } from 'class-validator';
import { TicketPriority } from '@prisma/client';

import { PaginationQueryDTO } from 'src/common/dto/pagination-query.dto';
import { toStringArray } from 'src/common/transforms/to-string-array.transform';
import { TICKET_SORTABLE_FIELDS, TICKET_VIEWS, type TicketSortField, type TicketView } from '../constants/ticket.constants';

export class GetAllTicketsQueryDTO extends PaginationQueryDTO {
  @IsOptional()
  @IsIn(TICKET_VIEWS)
  view?: TicketView;

  @IsOptional()
  @Transform(toStringArray)
  @IsUUID('4', { each: true })
  ticketStatusId?: string[];

  @IsOptional()
  @Transform(toStringArray)
  @IsEnum(TicketPriority, { each: true })
  priority?: TicketPriority[];

  @IsOptional()
  @Transform(toStringArray)
  @IsUUID('4', { each: true })
  teamId?: string[];

  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @IsUUID()
  assigneeId?: string;

  @IsOptional()
  @IsUUID()
  projectId?: string;

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
