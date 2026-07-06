import { Body, Controller, Delete, Get, Header, Param, Patch, Post, Query, Res, StreamableFile } from '@nestjs/common';
import { ApiForbiddenResponse, ApiOkResponse, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { Session } from '@thallesp/nestjs-better-auth';
import type { UserSession } from '@thallesp/nestjs-better-auth';

import { CurrentOrganizationId } from '../../../common/decorators/current-organization-id.decorator';
import { BulkApproveTimesheetEntriesDTO } from './dto/bulk-approve-timesheet-entries.dto';
import { BulkRejectTimesheetEntriesDTO } from './dto/bulk-reject-timesheet-entries.dto';
import { CreateTimesheetEntryDTO } from './dto/create-timesheet-entry.dto';
import { GetTimesheetAuditLogsQueryDTO } from './dto/get-timesheet-audit-logs-query.dto';
import { GetTimesheetEntriesQueryDTO } from './dto/get-timesheet-entries-query.dto';
import { GetTimesheetPeriodLockQueryDTO } from './dto/get-timesheet-period-lock-query.dto';
import { GetTimesheetProjectsQueryDTO } from './dto/get-timesheet-projects-query.dto';
import { GetTimesheetSummaryQueryDTO } from './dto/get-timesheet-summary-query.dto';
import { LockTimesheetPeriodDTO } from './dto/lock-timesheet-period.dto';
import { SubmitTimesheetWeekDTO } from './dto/submit-timesheet-week.dto';
import { UnlockTimesheetPeriodDTO } from './dto/unlock-timesheet-period.dto';
import { UpdateTimesheetEntryDTO } from './dto/update-timesheet-entry.dto';
import { TimesheetService } from './timesheet.service';

@ApiTags('Timekeeping - Timesheet')
@ApiForbiddenResponse({ description: 'Authentication, organization membership, or role permission failed.' })
@Controller('timekeeping/timesheet')
export class TimesheetController {
  constructor(private readonly timesheetService: TimesheetService) {}

  @Get('entries')
  @ApiOperation({ summary: 'List current employee timesheet entries for a period.' })
  @ApiOkResponse({ description: 'Paginated entries scoped to the authenticated employee.' })
  getEntries(
    @Query() query: GetTimesheetEntriesQueryDTO,
    @CurrentOrganizationId() organizationId: string,
    @Session() session?: UserSession,
  ) {
    return this.timesheetService.getEntries(organizationId, session?.user?.id, query);
  }

  @Post('entries')
  @ApiOperation({ summary: 'Create a draft timesheet entry for the current employee.' })
  @ApiOkResponse({ description: 'Created draft timesheet entry.' })
  createEntry(
    @Body() body: CreateTimesheetEntryDTO,
    @CurrentOrganizationId() organizationId: string,
    @Session() session?: UserSession,
  ) {
    return this.timesheetService.createEntry(organizationId, session?.user?.id, body);
  }

  @Post('entries/submit-week')
  @ApiOperation({ summary: 'Submit all draft entries in a weekly period for approval.' })
  @ApiOkResponse({ description: 'Submitted entry count and updated entries.' })
  submitWeek(
    @Body() body: SubmitTimesheetWeekDTO,
    @CurrentOrganizationId() organizationId: string,
    @Session() session?: UserSession,
  ) {
    return this.timesheetService.submitWeek(organizationId, session?.user?.id, body);
  }

  @Post('entries/bulk-approve')
  @ApiOperation({ summary: 'Approve submitted timesheet entries.' })
  @ApiOkResponse({ description: 'Approved entry count and updated entries.' })
  bulkApproveEntries(
    @Body() body: BulkApproveTimesheetEntriesDTO,
    @CurrentOrganizationId() organizationId: string,
    @Session() session?: UserSession,
  ) {
    return this.timesheetService.bulkApproveEntries(organizationId, session?.user?.id, body);
  }

  @Post('entries/bulk-reject')
  @ApiOperation({ summary: 'Reject submitted timesheet entries with a reason.' })
  @ApiOkResponse({ description: 'Rejected entry count and updated entries.' })
  bulkRejectEntries(
    @Body() body: BulkRejectTimesheetEntriesDTO,
    @CurrentOrganizationId() organizationId: string,
    @Session() session?: UserSession,
  ) {
    return this.timesheetService.bulkRejectEntries(organizationId, session?.user?.id, body);
  }

  @Patch('entries/:id')
  @ApiOperation({ summary: 'Update the current employee draft entry.' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ description: 'Updated draft timesheet entry.' })
  updateEntry(
    @Param('id') id: string,
    @Body() body: UpdateTimesheetEntryDTO,
    @CurrentOrganizationId() organizationId: string,
    @Session() session?: UserSession,
  ) {
    return this.timesheetService.updateEntry(id, organizationId, session?.user?.id, body);
  }

  @Delete('entries/:id')
  @ApiOperation({ summary: 'Delete the current employee draft entry.' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ description: 'Deleted entry id.' })
  async deleteEntry(
    @Param('id') id: string,
    @CurrentOrganizationId() organizationId: string,
    @Session() session?: UserSession,
  ) {
    await this.timesheetService.deleteEntry(id, organizationId, session?.user?.id);
    return { id };
  }

  @Get('summary')
  @ApiOperation({ summary: 'Get approver summary for timesheet review.' })
  @ApiOkResponse({ description: 'Employee, daily, project, and status summary for a period.' })
  getSummary(
    @Query() query: GetTimesheetSummaryQueryDTO,
    @CurrentOrganizationId() organizationId: string,
    @Session() session?: UserSession,
  ) {
    return this.timesheetService.getSummary(organizationId, session?.user?.id, query);
  }

  @Get('export.xlsx')
  @Header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  @ApiOperation({ summary: 'Export filtered timesheet details as a formatted XLSX workbook.' })
  @ApiOkResponse({ description: 'XLSX file stream.' })
  async exportTimesheet(
    @Query() query: GetTimesheetSummaryQueryDTO,
    @CurrentOrganizationId() organizationId: string,
    @Res({ passthrough: true }) response: Response,
    @Session() session?: UserSession,
  ) {
    const exportResult = await this.timesheetService.exportTimesheet(organizationId, session?.user?.id, query);
    response.setHeader('Content-Type', exportResult.mimeType);
    response.setHeader('Content-Disposition', `attachment; filename="${exportResult.filename}"`);
    response.setHeader('Content-Length', exportResult.buffer.length);
    return new StreamableFile(exportResult.buffer);
  }

  @Get('period-lock')
  @ApiOperation({ summary: 'Read lock state for a weekly timesheet period.' })
  @ApiOkResponse({ description: 'Period lock state and lock/unlock metadata.' })
  getPeriodLock(
    @Query() query: GetTimesheetPeriodLockQueryDTO,
    @CurrentOrganizationId() organizationId: string,
    @Session() session?: UserSession,
  ) {
    return this.timesheetService.getPeriodLock(organizationId, session?.user?.id, query);
  }

  @Post('period-lock/lock')
  @ApiOperation({ summary: 'Lock a weekly period. Owner role required.' })
  @ApiOkResponse({ description: 'Locked period row.' })
  lockPeriod(
    @Body() body: LockTimesheetPeriodDTO,
    @CurrentOrganizationId() organizationId: string,
    @Session() session?: UserSession,
  ) {
    return this.timesheetService.lockPeriod(organizationId, session?.user?.id, body);
  }

  @Post('period-lock/unlock')
  @ApiOperation({ summary: 'Unlock a weekly period with a reason. Owner role required.' })
  @ApiOkResponse({ description: 'Unlocked period row.' })
  unlockPeriod(
    @Body() body: UnlockTimesheetPeriodDTO,
    @CurrentOrganizationId() organizationId: string,
    @Session() session?: UserSession,
  ) {
    return this.timesheetService.unlockPeriod(organizationId, session?.user?.id, body);
  }

  @Get('audit-logs')
  @ApiOperation({ summary: 'List timesheet audit logs for approvers.' })
  @ApiOkResponse({ description: 'Paginated audit log records.' })
  getAuditLogs(
    @Query() query: GetTimesheetAuditLogsQueryDTO,
    @CurrentOrganizationId() organizationId: string,
    @Session() session?: UserSession,
  ) {
    return this.timesheetService.getAuditLogs(organizationId, session?.user?.id, query);
  }

  @Get('projects')
  @ApiOperation({ summary: 'Search active organization projects/work orders for timesheet entry.' })
  @ApiOkResponse({ description: 'Paginated project lookup results.' })
  getProjects(
    @Query() query: GetTimesheetProjectsQueryDTO,
    @CurrentOrganizationId() organizationId: string,
    @Session() session?: UserSession,
  ) {
    return this.timesheetService.getProjects(organizationId, session?.user?.id, query);
  }
}
