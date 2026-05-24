import { Controller, Get, NotImplementedException } from '@nestjs/common';
import { AttendanceService } from './attendance.service';

@Controller('timekeeping/attendance')
export class AttendanceController {
  constructor(private readonly attendanceService: AttendanceService) {}

  @Get()
  async recognize() {
    throw new NotImplementedException('recognize() is not implemented');
  }
}