import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsOptional, IsString, IsUUID } from 'class-validator';

import { toStringArray } from 'src/common/transforms/to-string-array.transform';
import { TICKET_VIEWS, type TicketView } from '../constants/ticket.constants';

/**
 * Context for faceted counts. Counts respect the current `view` + `search` and the
 * active scope filters (`teamId`/`categoryId`/`assigneeId`), so the numbers match
 * what the list shows, but deliberately ignore the active status/priority
 * selections, so each option's badge reflects what picking it would yield.
 */
export class GetTicketFacetsQueryDTO {
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
