import { Module } from '@nestjs/common';
import { AttendanceModule } from './attendance/attendance.module';

@Module({
  imports: [AttendanceModule]
})
export class TimekeepingModule {}
