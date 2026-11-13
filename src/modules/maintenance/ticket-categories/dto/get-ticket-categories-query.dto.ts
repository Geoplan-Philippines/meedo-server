import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';

import { ListQueryDTO } from '../../../../common/dto/list-query.dto';

export const TICKET_CATEGORY_SORT_FIELDS = ['name', 'createdAt', 'updatedAt'] as const;
export type TicketCategorySortField = (typeof TICKET_CATEGORY_SORT_FIELDS)[number];

/** Search matches name and description. */
export class GetTicketCategoriesQueryDTO extends ListQueryDTO {
  @ApiPropertyOptional({ enum: TICKET_CATEGORY_SORT_FIELDS, default: 'name' })
  @IsOptional()
  @IsIn(TICKET_CATEGORY_SORT_FIELDS)
  sortField?: TicketCategorySortField;
}
