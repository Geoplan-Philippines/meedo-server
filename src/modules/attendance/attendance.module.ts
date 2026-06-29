import { Module } from '@nestjs/common';
import { AttendanceService } from './attendance.service';
import { AttendanceController } from './attendance.controller';
import { AttendanceScheduler } from './attendance.scheduler';
import { HikvisionClient } from './biometrics/hikvision.client';
import { BiometricSyncService } from './biometrics/biometric-sync.service';
import { BiometricScheduler } from './biometrics/biometric.scheduler';

@Module({
  controllers: [AttendanceController],
  providers: [
    AttendanceService,
    AttendanceScheduler,
    HikvisionClient,
    BiometricSyncService,
    BiometricScheduler,
  ],
  exports: [AttendanceService],
})
export class AttendanceModule {}
