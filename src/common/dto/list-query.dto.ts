import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

import { PaginationQueryDTO } from './pagination-query.dto';

export const SORT_ORDERS = ['asc', 'desc'] as const;
export type SortOrder = (typeof SORT_ORDERS)[number];

export const LIST_SEARCH_MAX_LENGTH = 100;

/** Trims a query string and turns a blank one into "not provided". */
export const trimToUndefined = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() || undefined : value;

/** Turns `true`/`'true'` into true and `false`/`'false'` into false; anything else passes through for validation. */
export const toBoolean = ({ value }: { value: unknown }): unknown =>
  value === true || value === 'true' ? true : value === false || value === 'false' ? false : value;

/**
 * The request shape every list endpoint shares: `page`, `limit`, a trimmed
 * `search` term and `sortOrder`. Each endpoint extends it with its own
 * `sortField` whitelist and filters, and answers with
 * `{ data, meta: { total, page, limit, lastPage } }` (see `toPage`).
 */
export class ListQueryDTO extends PaginationQueryDTO {
  @ApiPropertyOptional({ maxLength: LIST_SEARCH_MAX_LENGTH, description: 'Case-insensitive search' })
  @IsOptional()
  @Transform(trimToUndefined)
  @IsString()
  @MaxLength(LIST_SEARCH_MAX_LENGTH)
  search?: string;

  @ApiPropertyOptional({ enum: SORT_ORDERS })
  @IsOptional()
  @IsIn(SORT_ORDERS)
  sortOrder?: SortOrder;
}
