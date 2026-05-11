import { Module } from '@nestjs/common';
import { AttendanceService } from './attendance.service';
import { AttendanceController } from './attendance.controller';
import { FaceModule } from './face/face.module';

@Module({
  controllers: [AttendanceController],
  providers: [AttendanceService],
  imports: [FaceModule],
})
export class AttendanceModule {}
