import { Injectable, Logger } from '@nestjs/common';
import { AttendanceOrigin } from '@prisma/client';

import { PrismaService } from 'src/core/database/prisma.service';
import { AttendanceService } from '../attendance.service';
import { HikvisionClient } from './hikvision.client';
import { SYNC_MAX_LOOKBACK_MS, SYNC_OVERLAP_MS } from './biometrics.constants';

/**
 * Pulls access taps from the Hikvision device and folds them into attendance.
 * Runs on a short interval, so a tap lands within seconds; `externalId` dedupe
 * keeps the re-scanned overlap harmless.
 */
@Injectable()
export class BiometricSyncService {
  private readonly logger = new Logger(BiometricSyncService.name);

  /** Guards against a slow run overlapping the next scheduled tick. */
  private running = false;

  /**
   * Wall-clock instant the last successful poll scanned up to. Keeps each
   * high-frequency poll's window tight instead of re-scanning from the last
   * stored tap every time. Null until the first successful run (or after a
   * process restart), when we cold-start from the database.
   */
  private cursor: Date | null = null;

  constructor(
    private readonly hikvision: HikvisionClient,
    private readonly attendance: AttendanceService,
    private readonly prisma: PrismaService,
  ) {}

  /** Sync taps up to `now`. Returns the number of new events ingested. */
  async sync(now: Date = new Date()): Promise<number> {
    if (!this.hikvision.isConfigured) {
      this.logger.warn('Hikvision not configured; skipping biometric sync.');
      return 0;
    }
    if (this.running) {
      this.logger.warn('Previous biometric sync still running; skipping this tick.');
      return 0;
    }

    this.running = true;
    try {
      const start = await this.resolveWindowStart(now);
      const taps = await this.hikvision.fetchAccessEvents(start, now);
      const ingested = await this.attendance.ingestBiometricAccess(taps);

      // Advance only after a successful pull, so a failure retries the same
      // window next tick instead of skipping past it.
      this.cursor = now;

      if (ingested > 0) {
        this.logger.log(`Ingested ${ingested} biometric tap(s).`);
      }
      return ingested;
    } finally {
      this.running = false;
    }
  }

  /**
   * Where this poll starts. Once running, resume from where the last poll ended
   * (minus an overlap) to keep the window tight. On a cold process, resume from
   * the last tap ever stored. Never look back past the lookback floor, so a
   * first run — or one after long downtime — can't replay the whole device log.
   */
  private async resolveWindowStart(now: Date): Promise<Date> {
    const floor = new Date(now.getTime() - SYNC_MAX_LOOKBACK_MS);

    const anchor = this.cursor ?? (await this.lastStoredTapAt());
    if (!anchor) {
      return floor;
    }

    const resume = new Date(anchor.getTime() - SYNC_OVERLAP_MS);
    return resume > floor ? resume : floor;
  }

  /** Timestamp of the most recent biometric tap already stored, if any. */
  private async lastStoredTapAt(): Promise<Date | null> {
    const last = await this.prisma.attendanceEvent.aggregate({
      where: { origin: AttendanceOrigin.BIOMETRICS },
      _max: { timestamp: true },
    });
    return last._max.timestamp ?? null;
  }
}
