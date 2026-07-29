import { Body, Controller, Delete, Get, Param, Patch, Post, Put } from '@nestjs/common';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';

import { CurrentOrganizationId } from '../../../../common/decorators/current-organization-id.decorator';
import { CreateWeeklyScheduleDTO } from './dto/create-weekly-schedule.dto';
import { SetScheduleDaysDTO } from './dto/set-schedule-days.dto';
import { UpdateWeeklyScheduleDTO } from './dto/update-weekly-schedule.dto';
import { WeeklySchedulesService } from './weekly-schedules.service';

@Controller('settings/attendance/weekly-schedules')
export class WeeklySchedulesController {
  constructor(private readonly weeklySchedulesService: WeeklySchedulesService) {}

  @AllowAnonymous()
  @Get()
  getSchedules(@CurrentOrganizationId() organizationId: string) {
    return this.weeklySchedulesService.getSchedules(organizationId);
  }

  @AllowAnonymous()
  @Get(':id')
  getSchedule(@Param('id') id: string, @CurrentOrganizationId() organizationId: string) {
    return this.weeklySchedulesService.getSchedule(id, organizationId);
  }

  @AllowAnonymous()
  @Post()
  createSchedule(
    @Body() body: CreateWeeklyScheduleDTO,
    @CurrentOrganizationId() organizationId: string,
  ) {
    return this.weeklySchedulesService.createSchedule(body, organizationId);
  }

  @AllowAnonymous()
  @Patch(':id')
  updateSchedule(
    @Param('id') id: string,
    @Body() body: UpdateWeeklyScheduleDTO,
    @CurrentOrganizationId() organizationId: string,
  ) {
    return this.weeklySchedulesService.updateSchedule(id, body, organizationId);
  }

  @AllowAnonymous()
  @Put(':id/days')
  setDays(
    @Param('id') id: string,
    @Body() body: SetScheduleDaysDTO,
    @CurrentOrganizationId() organizationId: string,
  ) {
    return this.weeklySchedulesService.setDays(id, body, organizationId);
  }

  @AllowAnonymous()
  @Patch(':id/default')
  setDefault(@Param('id') id: string, @CurrentOrganizationId() organizationId: string) {
    return this.weeklySchedulesService.setDefault(id, organizationId);
  }

  @AllowAnonymous()
  @Delete(':id')
  deleteSchedule(@Param('id') id: string, @CurrentOrganizationId() organizationId: string) {
    return this.weeklySchedulesService.deleteSchedule(id, organizationId);
  }
}
