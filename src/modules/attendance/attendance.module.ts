import { Module } from '@nestjs/common';
import { AttendanceService } from './attendance.service';
import { AttendanceController } from './attendance.controller';
import { AttendanceScheduler } from './attendance.scheduler';

@Module({
  controllers: [AttendanceController],
  providers: [AttendanceService, AttendanceScheduler],
  exports: [AttendanceService],
})
export class AttendanceModule {}
