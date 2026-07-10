import { Body, Controller, Delete, Get, Param, Put, Query } from '@nestjs/common';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';

import { CurrentOrganizationId } from '../../../../common/decorators/current-organization-id.decorator';
import { AssignScheduleDTO } from './dto/assign-schedule.dto';
import { ScheduleResolverService } from './resolver/schedule-resolver.service';
import { ScheduleAssignmentsService } from './schedule-assignments.service';

@Controller('settings/attendance/assignments')
export class ScheduleAssignmentsController {
  constructor(
    private readonly assignmentsService: ScheduleAssignmentsService,
    private readonly resolverService: ScheduleResolverService,
  ) {}

  @AllowAnonymous()
  @Get()
  listAssignments(@CurrentOrganizationId() organizationId: string) {
    return this.assignmentsService.listAssignments(organizationId);
  }

  @AllowAnonymous()
  @Put('teams/:teamId')
  assignTeam(
    @Param('teamId') teamId: string,
    @Body() body: AssignScheduleDTO,
    @CurrentOrganizationId() organizationId: string,
  ) {
    return this.assignmentsService.assignTeam(organizationId, teamId, body.weeklyScheduleId);
  }

  @AllowAnonymous()
  @Delete('teams/:teamId')
  clearTeam(@Param('teamId') teamId: string, @CurrentOrganizationId() organizationId: string) {
    return this.assignmentsService.clearTeam(organizationId, teamId);
  }

  @AllowAnonymous()
  @Put('employees/:userId')
  assignEmployee(
    @Param('userId') userId: string,
    @Body() body: AssignScheduleDTO,
    @CurrentOrganizationId() organizationId: string,
  ) {
    return this.assignmentsService.assignEmployee(organizationId, userId, body.weeklyScheduleId);
  }

  @AllowAnonymous()
  @Delete('employees/:userId')
  clearEmployee(@Param('userId') userId: string, @CurrentOrganizationId() organizationId: string) {
    return this.assignmentsService.clearEmployee(organizationId, userId);
  }

  /** Preview the schedule/shift/mode that currently applies to an employee on a date. */
  @AllowAnonymous()
  @Get('effective/:userId')
  getEffective(
    @Param('userId') userId: string,
    @CurrentOrganizationId() organizationId: string,
    @Query('date') date?: string,
  ) {
    return this.resolverService.resolveEffective(organizationId, userId, date);
  }
}
