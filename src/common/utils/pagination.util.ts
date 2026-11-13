import { Prisma } from '@prisma/client';

import { PaginatedResponse, buildPaginationMeta } from '../responses/paginated-api.response';
import type { SortOrder } from '../dto/list-query.dto';

export interface PageQuery {
  page: number;
  limit: number;
}

/** Prisma `skip`/`take` for a 1-based page. */
export function pageArgs({ page, limit }: PageQuery): { skip: number; take: number } {
  return { skip: (page - 1) * limit, take: limit };
}

/** The shared list response: one page of rows plus the total that matched. */
export function toPage<T>(data: T[], total: number, { page, limit }: PageQuery): PaginatedResponse<T> {
  return { data, meta: buildPaginationMeta(total, page, limit) };
}

/** Splits a search into words, so "jane smith" matches a first and a last name. */
export function searchTerms(search: string | undefined): string[] {
  return (search ?? '').split(/\s+/).map((term) => term.trim()).filter(Boolean);
}

/**
 * Every word must match at least one of the fields `matchTerm` returns. Returns
 * `{}` for an empty search so it can be spread into a `where`.
 */
export function termSearchWhere<W>(search: string | undefined, matchTerm: (term: string) => W[]): { AND?: { OR: W[] }[] } {
  const terms = searchTerms(search);
  return terms.length ? { AND: terms.map((term) => ({ OR: matchTerm(term) })) } : {};
}

/** Escapes LIKE wildcards so a raw `ILIKE '%' || term || '%'` matches the text literally. */
export function escapeLikePattern(term: string): string {
  return term.replace(/[\\%_]/g, (char) => `\\${char}`);
}

/**
 * Case-insensitive `contains` for Prisma string filters. Prisma passes the
 * term into LIKE unescaped, so "50%" would match "50" anywhere; escaping keeps
 * it literal and in step with the raw name-sort queries' counts.
 */
export function containsInsensitive(term: string): Prisma.StringFilter {
  return { contains: escapeLikePattern(term), mode: 'insensitive' };
}

/** `ASC`/`DESC` for raw SQL, only ever from the validated sort order. */
export function sqlDirection(order: SortOrder | undefined, fallback: SortOrder = 'asc'): Prisma.Sql {
  return Prisma.raw((order ?? fallback) === 'desc' ? 'DESC' : 'ASC');
}

/** Puts rows back in the order of `ids` (used after a raw query picked and ordered the page). */
export function orderByIds<T extends { id: string }>(rows: T[], ids: string[]): T[] {
  const byId = new Map(rows.map((row) => [row.id, row]));
  return ids.flatMap((id) => {
    const row = byId.get(id);
    return row ? [row] : [];
  });
}
