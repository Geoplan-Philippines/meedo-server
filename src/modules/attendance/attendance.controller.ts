import { Body, Controller, Get, Header, MessageEvent, Param, ParseUUIDPipe, Post, Query, Sse } from '@nestjs/common';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';
import { Observable } from 'rxjs';

import { PaginatedResponse } from 'src/common/responses/paginated-api.response';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CurrentOrganizationId } from '../../common/decorators/current-organization-id.decorator';
import { AttendanceService } from './attendance.service';
import { BiometricSyncService } from './biometrics/biometric-sync.service';
import { CreateAttendanceEventDTO } from './dto/create-attendance-event.dto';
import { GetAttendanceHistoryQueryDTO } from './dto/get-attendance-history-query.dto';
import { GetRosterQueryDTO } from './dto/get-roster-query.dto';
import { IngestBiometricEventDTO } from './dto/ingest-biometric-event.dto';
import { AttendanceUpdatesService } from './attendance-updates.service';
import {
  AttendanceEventRecord,
  AttendanceRecord,
  DailyAttendanceSummary,
  RosterResult,
} from './constants/attendance.constants';

@Controller('attendance')
export class AttendanceController {
  constructor(
    private readonly attendanceService: AttendanceService,
    private readonly biometricSync: BiometricSyncService,
    private readonly attendanceUpdates: AttendanceUpdatesService,
  ) {}

  /** Manager-only: pull the latest biometric taps now instead of waiting for the cron. */
  @Post('biometrics/sync')
  async syncBiometrics(
    @CurrentOrganizationId() organizationId: string,
    @CurrentUser('id') callerId: string,
  ): Promise<{ ingested: number }> {
    await this.attendanceService.assertOrgManager(callerId, organizationId);
    const ingested = await this.biometricSync.sync();
    return { ingested };
  }

  @Post('events')
  async recordAttendanceEvent(
    @Body() body: CreateAttendanceEventDTO,
    @CurrentUser('id') employeeId: string,
  ): Promise<AttendanceEventRecord> {
    const event = await this.attendanceService.recordAttendanceEvent(employeeId, body);
    this.attendanceUpdates.notify('manual');
    return event;
  }

  /** Machine-to-machine receiver used by the on-premise Hikvision sync agent. */
  @AllowAnonymous()
  @Post('event')
  async ingestBiometricEvent(@Body() body: IngestBiometricEventDTO): Promise<{ ingested: number }> {
    const ingested = await this.attendanceService.ingestBiometricAccess([{
      externalId: body.externalId,
      biometricsId: body.biometricsId,
      timestamp: new Date(body.timestamp),
    }]);
    if (ingested > 0) this.attendanceUpdates.notify('biometric');
    return { ingested };
  }

  @Header('X-Accel-Buffering', 'no')
  @Sse('updates')
  attendanceUpdateStream(): Observable<MessageEvent> {
    return this.attendanceUpdates.stream();
  }

  /** Device identifiers currently mapped to users; consumed by the on-premise sync agent. */
  @AllowAnonymous()
  @Get('biometrics/ids')
  async getRegisteredBiometricIds(): Promise<{ biometricsIds: string[] }> {
    return { biometricsIds: await this.attendanceService.getRegisteredBiometricIds() };
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
