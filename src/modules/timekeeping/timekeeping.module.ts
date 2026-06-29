import { Module } from '@nestjs/common';
import { AttendanceModule } from './attendance/attendance.module';
import { TimesheetModule } from './timesheet/timesheet.module';

@Module({
  imports: [AttendanceModule, TimesheetModule]
})
export class TimekeepingModule {}
