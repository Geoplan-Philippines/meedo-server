import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsIn, IsOptional, IsString, IsUUID } from 'class-validator';
import { TicketPriority } from '@prisma/client';

import { PaginationQueryDTO } from 'src/common/dto/pagination-query.dto';
import { TICKET_SORTABLE_FIELDS, TICKET_VIEWS, type TicketSortField, type TicketView } from '../constants/ticket.constants';

/** Coerce a repeated (`?k=a&k=b`) or comma-separated (`?k=a,b`) query param into a
 *  trimmed string array; leave undefined when the param is absent. */
const toStringArray = ({ value }: { value: unknown }): string[] | undefined => {
  if (value === undefined || value === null) return undefined;
  const raw = Array.isArray(value) ? value : String(value).split(',');
  return raw.map((entry) => String(entry).trim()).filter(Boolean);
};

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
