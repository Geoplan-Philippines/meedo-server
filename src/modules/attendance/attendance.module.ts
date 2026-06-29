import { Module } from '@nestjs/common';
import { AttendanceService } from './attendance.service';
import { AttendanceController } from './attendance.controller';
import { AttendanceScheduler } from './attendance.scheduler';
import { HikvisionClient } from './biometrics/hikvision.client';
import { BiometricSyncService } from './biometrics/biometric-sync.service';
import { AttendanceUpdatesService } from './attendance-updates.service';

@Module({
  controllers: [AttendanceController],
  providers: [
    AttendanceService,
    AttendanceUpdatesService,
    AttendanceScheduler,
    HikvisionClient,
    BiometricSyncService,
  ],
  exports: [AttendanceService],
})
export class AttendanceModule {}
