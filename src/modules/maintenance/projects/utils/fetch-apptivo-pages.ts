import { HttpException, HttpStatus, Logger } from '@nestjs/common';
import { env } from '../../../../core/config/env.config';
import { ApptivoResponse } from '../types/project.type';

export const APPTIVO_PAGE_SIZE = 500;

/**
 * GETs every page of an Apptivo list endpoint. Refuses to return a partial list: if the
 * page cap (APPTIVO_SYNC_MAX_PAGES) is reached while records remain, it throws, so the sync
 * aborts before its transaction opens and nothing is written or archived.
 *
 * "Records remain" means the last page was full and the fetched count is below Apptivo's
 * countOfRecords. When countOfRecords is missing, completeness cannot be shown, so a full
 * last page at the cap also throws.
 */
export async function fetchApptivoPages<T>(resource: string, label: string, logger: Logger): Promise<T[]> {
  const maxPages = env.APPTIVO_SYNC_MAX_PAGES;
  const records: T[] = [];
  let countOfRecords: number | undefined;
  let pages = 0;

  for (;;) {
    const url = `${resource}&numRecords=${APPTIVO_PAGE_SIZE}&startIndex=${records.length}&apiKey=${env.APPTIVO_API_KEY}&accessKey=${env.APPTIVO_API_ACCESS_KEY}`;

    let payload: ApptivoResponse<T>;
    try {
      const response = await fetch(url, { headers: { Accept: 'application/json' } });

      if (!response.ok) {
        throw new HttpException(`Failed to fetch Apptivo ${label}`, HttpStatus.BAD_GATEWAY);
      }

      payload = (await response.json()) as ApptivoResponse<T>;
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new HttpException(`Network error while fetching Apptivo ${label}`, HttpStatus.BAD_GATEWAY);
    }

    const items = payload?.data;

    if (!Array.isArray(items)) {
      throw new HttpException('Unexpected Apptivo response structure', HttpStatus.INTERNAL_SERVER_ERROR);
    }

    pages++;
    records.push(...items);
    if (typeof payload.countOfRecords === 'number') countOfRecords = payload.countOfRecords;

    const lastPage = items.length < APPTIVO_PAGE_SIZE || (countOfRecords !== undefined && records.length >= countOfRecords);
    if (lastPage) break;

    if (pages >= maxPages) {
      const remaining = countOfRecords !== undefined ? `${countOfRecords - records.length} of ${countOfRecords}` : 'an unknown number of';
      throw new HttpException(
        `Apptivo ${label} fetch hit the ${maxPages}-page cap (APPTIVO_SYNC_MAX_PAGES) with ${remaining} records not fetched; sync aborted, nothing was written or archived`,
        HttpStatus.BAD_GATEWAY,
      );
    }
  }

  logger.log(`Fetched ${records.length} Apptivo ${label} in ${pages} page(s) (countOfRecords: ${countOfRecords ?? 'not reported'}).`);
  return records;
}
