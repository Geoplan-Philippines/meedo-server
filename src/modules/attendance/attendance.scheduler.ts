import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';

import { AttendanceService } from './attendance.service';
import { AUTO_CLOCK_OUT_HOUR } from './constants/attendance.constants';

const COMPANY_TIMEZONE = 'Asia/Manila';

@Injectable()
export class AttendanceScheduler {
  private readonly logger = new Logger(AttendanceScheduler.name);

  constructor(private readonly attendanceService: AttendanceService) {}

  /**
   * Auto-clock out every still-open session at the cutoff hour, company time.
   * A real punch after the cutoff still wins, since `lastOut` is the day's
   * maximum event timestamp.
   */
  @Cron(`0 ${AUTO_CLOCK_OUT_HOUR} * * *`, {
    name: 'auto-clock-out',
    timeZone: COMPANY_TIMEZONE,
  })
  async autoClockOut(): Promise<void> {
    try {
      await this.attendanceService.runAutoClockOut();
    } catch (error) {
      this.logger.error('Auto-clock-out run failed.', error instanceof Error ? error.stack : error);
    }
  }
}
