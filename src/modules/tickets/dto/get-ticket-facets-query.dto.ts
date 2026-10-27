import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsIn, IsOptional, IsString, IsUUID } from 'class-validator';
import { TicketPriority } from '@prisma/client';

import { toStringArray } from 'src/common/transforms/to-string-array.transform';
import { TICKET_VIEWS, type TicketView } from '../constants/ticket.constants';

/**
 * Context for faceted counts. Counts respect the current `view` + `search` and the
 * active scope filters (`teamId`/`categoryId`/`assigneeId`), so the numbers match
 * what the list shows. Status selections are omitted. The list omits priority
 * selections for option badges; the board supplies them to scope column totals.
 */
export class GetTicketFacetsQueryDTO {
  // Optional board scope for column totals; priority option counts stay unfiltered.
  @IsOptional()
  @Transform(toStringArray)
  @IsEnum(TicketPriority, { each: true })
  priority?: TicketPriority[];

  @IsOptional()
  @IsIn(TICKET_VIEWS)
  view?: TicketView;

  @IsOptional()
  @Transform(toStringArray)
  @IsUUID('4', { each: true })
  teamId?: string[];

  @IsOptional()
  @IsUUID()
  categoryId?: string;

  /** Only tickets on this project (the sidebar's client > project > tickets path). */
  @IsOptional()
  @IsUUID()
  projectId?: string;

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
}
