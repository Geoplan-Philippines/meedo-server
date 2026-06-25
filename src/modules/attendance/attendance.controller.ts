import { Body, Controller, Get, Post, Query } from '@nestjs/common';

import { PaginatedResponse } from 'src/common/responses/paginated-api.response';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AttendanceService } from './attendance.service';
import { CreateAttendanceEventDTO } from './dto/create-attendance-event.dto';
import { GetAttendanceHistoryQueryDTO } from './dto/get-attendance-history-query.dto';
import {
  AttendanceEventRecord,
  AttendanceRecord,
  DailyAttendanceSummary,
} from './constants/attendance.constants';

@Controller('attendance')
export class AttendanceController {
  constructor(private readonly attendanceService: AttendanceService) {}

  @Post('events')
  async recordAttendanceEvent(
    @Body() body: CreateAttendanceEventDTO,
    @CurrentUser('id') employeeId: string,
  ): Promise<AttendanceEventRecord> {
    return this.attendanceService.recordAttendanceEvent(employeeId, body);
  }

  @Get('events')
  async getMyAttendanceEvents(
    @Query() query: GetAttendanceHistoryQueryDTO,
    @CurrentUser('id') employeeId: string,
  ): Promise<PaginatedResponse<AttendanceEventRecord>> {
    return this.attendanceService.getMyAttendanceEvents(employeeId, query);
  }

  @Get('summary')
  async getMyDailyAttendance(
    @CurrentUser('id') employeeId: string,
    @Query('date') date?: string,
  ): Promise<DailyAttendanceSummary> {
    return this.attendanceService.getMyDailyAttendance(employeeId, date);
  }

  @Get()
  async getMyAttendanceHistory(
    @Query() query: GetAttendanceHistoryQueryDTO,
    @CurrentUser('id') employeeId: string,
  ): Promise<PaginatedResponse<AttendanceRecord>> {
    return this.attendanceService.getMyAttendanceHistory(employeeId, query);
  }
}
