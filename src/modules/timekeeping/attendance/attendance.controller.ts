import { Controller, Get } from '@nestjs/common';
import { AttendanceService } from './attendance.service';

@Controller('timekeeping/attendance')
export class AttendanceController {
  constructor(private readonly attendanceService: AttendanceService) {}

  @Get('')
  async recognize() {
    return 'this.subscribersService.findAll();'
  }
}