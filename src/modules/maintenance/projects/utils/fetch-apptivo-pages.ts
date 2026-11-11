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

    const payload = await fetchPage<T>(url, label, pages + 1);

    const items = payload?.data;

    if (!Array.isArray(items)) {
      throw new HttpException(`Unexpected Apptivo response structure for ${label} page ${pages + 1}`, HttpStatus.INTERNAL_SERVER_ERROR);
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

/** The deadline covers both response headers and the entire JSON body. */
async function fetchPage<T>(url: string, label: string, page: number): Promise<ApptivoResponse<T>> {
  const timeoutMs = env.APPTIVO_REQUEST_TIMEOUT_MS;
  const maxRetries = env.APPTIVO_REQUEST_MAX_RETRIES;
  for (let attempt = 0; ; attempt++) {
    const controller = new AbortController();
    let timedOut = false;
    let reason = 'network error';
    let retryable = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const deadline = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          timedOut = true;
          controller.abort();
          reject(new Error('Request deadline exceeded'));
        }, timeoutMs);
      });
      const request = async () => {
        const response = await fetch(url, { headers: { Accept: 'application/json' }, signal: controller.signal });
        if (!response.ok) {
          reason = `HTTP ${response.status}`;
          retryable = [429, 502, 503, 504].includes(response.status);
          controller.abort();
          throw new Error(reason);
        }
        reason = 'invalid response body';
        retryable = false;
        return (await response.json()) as ApptivoResponse<T>;
      };
      return await Promise.race([request(), deadline]);
    } catch (error) {
      if (reason === 'invalid response body' && error instanceof TypeError) {
        reason = 'network error while reading response body';
        retryable = true;
      }
      if (timedOut) {
        reason = `timeout after ${timeoutMs} ms`;
        retryable = true;
      }
      if (!retryable || attempt >= maxRetries) {
        // Never expose URLs, credentials, or upstream exception messages.
        throw new HttpException(
          `Apptivo ${label} page ${page} failed: ${reason} after ${attempt + 1} attempt(s); sync aborted before reconciliation`,
          HttpStatus.BAD_GATEWAY,
        );
      }
    } finally {
      clearTimeout(timer);
    }
    // Bounded exponential backoff: 250-500 ms, then 500-750 ms.
    await new Promise<void>((resolve) => setTimeout(resolve, 250 * 2 ** attempt + Math.floor(Math.random() * 251)));
  }
}
