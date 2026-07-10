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
import {
  IngestBiometricEventDTO,
  IngestBiometricEventsDTO,
} from './dto/ingest-biometric-event.dto';
import { AttendanceUpdatesService } from './attendance-updates.service';
import {
  AttendanceEventRecord,
  DailyAttendanceSummary,
  EnrichedAttendanceRecord,
  RosterResult,
} from './constants/attendance.constants';
import { BiometricIngestResult } from './biometrics/biometrics.constants';

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
    if (ingested > 0) this.attendanceUpdates.notify('biometric');
    return { ingested };
  }

  /** Manager-only: list people enrolled on the configured Hikvision device. */
  @Get('biometrics/users')
  async getBiometricDeviceUsers(
    @CurrentOrganizationId() organizationId: string,
    @CurrentUser('id') callerId: string,
  ) {
    await this.attendanceService.assertOrgManager(callerId, organizationId);
    return { users: await this.biometricSync.listDeviceUsers() };
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
    const result = await this.attendanceService.ingestBiometricAccessDetailed([{
      externalId: body.externalId,
      biometricsId: body.biometricsId,
      timestamp: new Date(body.timestamp),
    }]);
    if (result.ingested > 0) this.attendanceUpdates.notify('biometric', result.affected);
    return { ingested: result.ingested };
  }

  /** Batch receiver used by the real-time on-premise agent. */
  @AllowAnonymous()
  @Post('events/biometric/batch')
  async ingestBiometricEvents(
    @Body() body: IngestBiometricEventsDTO,
  ): Promise<Omit<BiometricIngestResult, 'affected'>> {
    const result = await this.attendanceService.ingestBiometricAccessDetailed(
      body.events.map((event) => ({
        externalId: event.externalId,
        biometricsId: event.biometricsId,
        timestamp: new Date(event.timestamp),
      })),
    );
    if (result.ingested > 0) this.attendanceUpdates.notify('biometric', result.affected);
    const { affected: _affected, ...response } = result;
    return response;
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
    @CurrentOrganizationId() organizationId: string,
    @CurrentUser('id') employeeId: string,
    @Query('date') date?: string,
  ): Promise<DailyAttendanceSummary> {
    return this.attendanceService.getDailyAttendance(organizationId, employeeId, date);
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
  ): Promise<PaginatedResponse<EnrichedAttendanceRecord>> {
    return this.attendanceService.getEmployeeHistory(organizationId, callerId, employeeId, query);
  }

  @Get()
  async getMyAttendanceHistory(
    @Query() query: GetAttendanceHistoryQueryDTO,
    @CurrentOrganizationId() organizationId: string,
    @CurrentUser('id') employeeId: string,
  ): Promise<PaginatedResponse<EnrichedAttendanceRecord>> {
    return this.attendanceService.getMyAttendanceHistory(organizationId, employeeId, query);
  }
}
