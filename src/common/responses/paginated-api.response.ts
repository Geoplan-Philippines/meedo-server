export interface PaginationMeta {
  total: number;
  page: number;
  limit: number;
  lastPage: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: PaginationMeta;
}

export function buildPaginationMeta(total: number, page: number, limit: number): PaginationMeta {
  return { total, page, limit, lastPage: Math.ceil(total / limit) };
}