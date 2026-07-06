import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsOptional, IsString } from 'class-validator';

import { TICKET_VIEWS, type TicketView } from '../constants/ticket.constants';

/**
 * Context for faceted counts. Counts respect the current `view` + `search` (so the
 * numbers match what the list shows) but deliberately ignore the active
 * status/priority selections, so each option's badge reflects what picking it
 * would yield.
 */
export class GetTicketFacetsQueryDTO {
  @IsOptional()
  @IsIn(TICKET_VIEWS)
  view?: TicketView;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  includeArchived?: boolean;
}
