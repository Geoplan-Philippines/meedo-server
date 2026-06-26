import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';

import { PaginatedResponse } from 'src/common/responses/paginated-api.response';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CurrentOrganizationId } from '../../common/decorators/current-organization-id.decorator';
import { AttendanceService } from './attendance.service';
import { CreateAttendanceEventDTO } from './dto/create-attendance-event.dto';
import { GetAttendanceHistoryQueryDTO } from './dto/get-attendance-history-query.dto';
import { GetRosterQueryDTO } from './dto/get-roster-query.dto';
import {
  AttendanceEventRecord,
  AttendanceRecord,
  DailyAttendanceSummary,
  RosterResult,
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
    return this.attendanceService.getDailyAttendance(employeeId, date);
  }

  @Get('roster')
  async getOrganizationRoster(
    @Query() query: GetRosterQueryDTO,
    @CurrentOrganizationId() organizationId: string,
    @CurrentUser('id') callerId: string,
  ): Promise<RosterResult> {
    return this.attendanceService.getOrganizationRoster(organizationId, callerId, query);
  }

  @Get('roster/:employeeId')
  async getEmployeeDayAttendance(
    @Param('employeeId', ParseUUIDPipe) employeeId: string,
    @CurrentOrganizationId() organizationId: string,
    @CurrentUser('id') callerId: string,
    @Query('date') date?: string,
  ): Promise<DailyAttendanceSummary> {
    return this.attendanceService.getEmployeeDayAttendance(organizationId, callerId, employeeId, date);
  }

  @Get('roster/:employeeId/history')
  async getEmployeeHistory(
    @Param('employeeId', ParseUUIDPipe) employeeId: string,
    @Query() query: GetAttendanceHistoryQueryDTO,
    @CurrentOrganizationId() organizationId: string,
    @CurrentUser('id') callerId: string,
  ): Promise<PaginatedResponse<AttendanceRecord>> {
    return this.attendanceService.getEmployeeHistory(organizationId, callerId, employeeId, query);
  }

  @Get()
  async getMyAttendanceHistory(
    @Query() query: GetAttendanceHistoryQueryDTO,
    @CurrentUser('id') employeeId: string,
  ): Promise<PaginatedResponse<AttendanceRecord>> {
    return this.attendanceService.getMyAttendanceHistory(employeeId, query);
  }
}
