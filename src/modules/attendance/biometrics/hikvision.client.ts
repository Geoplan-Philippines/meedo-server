import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';

import { env } from 'src/core/config/env.config';
import { toCompanyOffsetIso } from '../utils/attendance-day.util';
import {
  ACS_EVENT_MAX_PAGES,
  ACS_EVENT_PAGE_SIZE,
  ACS_EVENT_PATH,
  BiometricTap,
} from './biometrics.constants';

/** Parsed `WWW-Authenticate: Digest ...` challenge from the device. */
interface DigestChallenge {
  realm: string;
  nonce: string;
  qop?: string;
  opaque?: string;
  algorithm?: string;
}

/** One match in an `AcsEvent` search response. */
interface AcsEventInfo {
  serialNo?: number;
  time?: string;
  employeeNoString?: string;
}

interface AcsEventResponse {
  AcsEvent?: {
    responseStatusStrg?: string;
    numOfMatches?: number;
    totalMatches?: number;
    InfoList?: AcsEventInfo[];
  };
}

interface HikvisionUserInfo {
  employeeNo?: string;
  name?: string;
  userType?: string;
  Valid?: { enable?: boolean };
}

interface UserInfoSearchResponse {
  UserInfoSearch?: {
    responseStatusStrg?: string;
    numOfMatches?: number;
    totalMatches?: number;
    UserInfo?: HikvisionUserInfo[];
  };
}

export interface HikvisionDirectoryUser {
  employeeNo: string;
  name: string;
  userType: string;
  enabled: boolean;
}

const USER_INFO_SEARCH_PATH = '/ISAPI/AccessControl/UserInfo/Search?format=json';
const USER_INFO_PAGE_SIZE = 10;
const USER_INFO_MAX_PAGES = 300;
const HIKVISION_REQUEST_TIMEOUT_MS = 8_000;

const md5 = (input: string): string => createHash('md5').update(input).digest('hex');

/**
 * Minimal Hikvision ISAPI client. Speaks HTTP digest auth (the device's default)
 * using `node:crypto`, so no extra dependency is needed, and exposes just the
 * access-control event search the attendance sync relies on.
 */
@Injectable()
export class HikvisionClient {
  private readonly logger = new Logger(HikvisionClient.name);

  private readonly host = env.HIKVISION_HOST;
  private readonly username = env.HIKVISION_USERNAME;
  private readonly password = env.HIKVISION_PASSWORD;

  /** True only when host + credentials are all configured. */
  get isConfigured(): boolean {
    return !!this.host && !!this.username && !!this.password;
  }

  private get baseUrl(): string {
    const host = this.host!.replace(/\/+$/, '');
    return /^https?:\/\//i.test(host) ? host : `http://${host}`;
  }

  /**
   * Pull every access tap in `[start, end)`, paging until the device reports no
   * more matches. Only events carrying an employee number and serial are kept.
   */
  async fetchAccessEvents(start: Date, end: Date): Promise<BiometricTap[]> {
    // The device rejects non-numeric searchIDs (a UUID returns HTTP 400). A fresh
    // random numeric id per run avoids the device replaying a cached result set.
    const searchID = `${Math.floor(Math.random() * 1e9)}`;
    const taps: BiometricTap[] = [];
    let position = 0;

    for (let page = 0; page < ACS_EVENT_MAX_PAGES; page += 1) {
      const body = {
        AcsEventCond: {
          searchID,
          searchResultPosition: position,
          maxResults: ACS_EVENT_PAGE_SIZE,
          major: 0,
          minor: 0,
          startTime: toCompanyOffsetIso(start),
          endTime: toCompanyOffsetIso(end),
        },
      };

      const result = await this.post<AcsEventResponse>(ACS_EVENT_PATH, body);
      const info = result.AcsEvent;
      const list = info?.InfoList ?? [];

      for (const event of list) {
        if (!event.employeeNoString || event.serialNo == null || !event.time) {
          continue;
        }
        taps.push({
          biometricsId: event.employeeNoString,
          timestamp: new Date(event.time),
          externalId: `hik:${event.serialNo}:${event.time}`,
        });
      }

      position += list.length;
      if (info?.responseStatusStrg !== 'MORE' || list.length === 0) {
        break;
      }
    }

    return taps;
  }

  /** Fetch every enrolled device user, respecting the device's 10-row page cap. */
  async fetchUsers(): Promise<HikvisionDirectoryUser[]> {
    if (!this.isConfigured) {
      throw new ServiceUnavailableException('Hikvision device is not configured');
    }

    const searchID = `${Math.floor(Math.random() * 1e9)}`;
    const users: HikvisionDirectoryUser[] = [];
    let position = 0;

    for (let page = 0; page < USER_INFO_MAX_PAGES; page += 1) {
      const result = await this.post<UserInfoSearchResponse>(USER_INFO_SEARCH_PATH, {
        UserInfoSearchCond: {
          searchID,
          searchResultPosition: position,
          maxResults: USER_INFO_PAGE_SIZE,
        },
      });
      const search = result.UserInfoSearch;
      const matches = search?.UserInfo ?? [];

      for (const user of matches) {
        const employeeNo = user.employeeNo?.trim();
        if (!employeeNo) continue;
        users.push({
          employeeNo,
          name: user.name?.trim() ?? '',
          userType: user.userType ?? 'normal',
          enabled: user.Valid?.enable ?? true,
        });
      }

      position += matches.length;
      const total = search?.totalMatches ?? Number.POSITIVE_INFINITY;
      if (
        matches.length === 0 ||
        search?.responseStatusStrg !== 'MORE' ||
        position >= total
      ) {
        return users.sort((a, b) =>
          a.employeeNo.localeCompare(b.employeeNo, undefined, { numeric: true }),
        );
      }
    }

    throw new ServiceUnavailableException('Hikvision user search exceeded the page limit');
  }

  /** POST with digest auth: try once unauthenticated, then answer the challenge. */
  private async post<T>(path: string, body: unknown): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const payload = JSON.stringify(body);
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'ngrok-skip-browser-warning': 'true',
    };

    let response: Response;
    try {
      response = await this.fetchWithTimeout(url, { method: 'POST', headers, body: payload });

      if (response.status === 401) {
        const challenge = response.headers.get('www-authenticate');
        if (!challenge) {
          throw new Error('Device demanded auth but sent no WWW-Authenticate header.');
        }
        const authorization = this.buildAuthHeader('POST', path, this.parseChallenge(challenge));
        response = await this.fetchWithTimeout(url, {
          method: 'POST',
          headers: { ...headers, Authorization: authorization },
          body: payload,
        });
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new ServiceUnavailableException(`Hikvision device unreachable: ${reason}`);
    }

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new ServiceUnavailableException(
        `Hikvision request failed (${response.status}): ${text.slice(0, 200)}`,
      );
    }

    return response.json() as Promise<T>;
  }

  private async fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), HIKVISION_REQUEST_TIMEOUT_MS);
    try {
      return await fetch(url, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timeout);
    }
  }
  private parseChallenge(header: string): DigestChallenge {
    const fields: Record<string, string> = {};
    const body = header.replace(/^Digest\s+/i, '');
    const pattern = /(\w+)=(?:"([^"]*)"|([^,]+))/g;

    let match: RegExpExecArray | null;
    while ((match = pattern.exec(body)) !== null) {
      fields[match[1]] = match[2] ?? match[3];
    }

    if (!fields.realm || !fields.nonce) {
      throw new Error('Malformed digest challenge from device.');
    }
    return {
      realm: fields.realm,
      nonce: fields.nonce,
      qop: fields.qop,
      opaque: fields.opaque,
      algorithm: fields.algorithm,
    };
  }

  private buildAuthHeader(method: string, uri: string, challenge: DigestChallenge): string {
    const ha1 = md5(`${this.username}:${challenge.realm}:${this.password}`);
    const ha2 = md5(`${method}:${uri}`);
    const qop = challenge.qop?.split(',')[0]?.trim();

    const nc = '00000001';
    const cnonce = randomBytes(8).toString('hex');
    const response = qop
      ? md5(`${ha1}:${challenge.nonce}:${nc}:${cnonce}:${qop}:${ha2}`)
      : md5(`${ha1}:${challenge.nonce}:${ha2}`);

    const parts = [
      `username="${this.username}"`,
      `realm="${challenge.realm}"`,
      `nonce="${challenge.nonce}"`,
      `uri="${uri}"`,
      `response="${response}"`,
    ];
    if (qop) {
      parts.push(`qop=${qop}`, `nc=${nc}`, `cnonce="${cnonce}"`);
    }
    if (challenge.opaque) {
      parts.push(`opaque="${challenge.opaque}"`);
    }
    if (challenge.algorithm) {
      parts.push(`algorithm=${challenge.algorithm}`);
    }
    return `Digest ${parts.join(', ')}`;
  }
}
