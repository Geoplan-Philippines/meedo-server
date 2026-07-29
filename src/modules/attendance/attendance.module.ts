import { Module } from '@nestjs/common';
import { AttendanceService } from './attendance.service';
import { AttendanceController } from './attendance.controller';
import { AttendanceScheduler } from './attendance.scheduler';
import { HikvisionClient } from './biometrics/hikvision.client';
import { BiometricSyncService } from './biometrics/biometric-sync.service';
import { AttendanceUpdatesService } from './attendance-updates.service';
import { ScheduleAssignmentsModule } from '../settings/attendance/assignments/schedule-assignments.module';
import { AttendanceBoardController } from './board/attendance-board.controller';
import { AttendanceBoardService } from './board/attendance-board.service';

@Module({
  imports: [ScheduleAssignmentsModule],
  controllers: [AttendanceController, AttendanceBoardController],
  providers: [
    AttendanceService,
    AttendanceUpdatesService,
    AttendanceScheduler,
    HikvisionClient,
    BiometricSyncService,
    AttendanceBoardService,
  ],
  exports: [AttendanceService],
})
export class AttendanceModule {}
