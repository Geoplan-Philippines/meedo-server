import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';

import { BiometricSyncService } from './biometric-sync.service';
import { SYNC_INTERVAL_MS } from './biometrics.constants';

@Injectable()
export class BiometricScheduler {
  private readonly logger = new Logger(BiometricScheduler.name);

  constructor(private readonly biometricSync: BiometricSyncService) {}

  /** Poll the device every few seconds so a tap syncs in near real time. */
  @Interval('biometric-sync', SYNC_INTERVAL_MS)
  async sync(): Promise<void> {
    try {
      await this.biometricSync.sync();
    } catch (error) {
      this.logger.error(
        'Biometric sync run failed.',
        error instanceof Error ? error.stack : error,
      );
    }
  }
}
