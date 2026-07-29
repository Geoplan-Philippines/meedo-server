import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';

import { CurrentOrganizationId } from '../../../../common/decorators/current-organization-id.decorator';
import { ClearHolidaysQueryDTO } from './dto/clear-holidays-query.dto';
import { CreateHolidayDTO } from './dto/create-holiday.dto';
import { GenerateHolidaysDTO } from './dto/generate-holidays.dto';
import { GetHolidaysQueryDTO } from './dto/get-holidays-query.dto';
import { UpdateHolidayDTO } from './dto/update-holiday.dto';
import { HolidaysService } from './holidays.service';

@Controller('settings/attendance/holidays')
export class HolidaysController {
  constructor(private readonly holidaysService: HolidaysService) {}

  @AllowAnonymous()
  @Get()
  getHolidays(
    @Query() query: GetHolidaysQueryDTO,
    @CurrentOrganizationId() organizationId: string,
  ) {
    return this.holidaysService.getHolidays(organizationId, query.year);
  }

  @AllowAnonymous()
  @Post()
  createHoliday(@Body() body: CreateHolidayDTO, @CurrentOrganizationId() organizationId: string) {
    return this.holidaysService.createHoliday(body, organizationId);
  }

  /** Import a year's public holidays from an external provider. */
  @AllowAnonymous()
  @Post('generate')
  generateHolidays(
    @Body() body: GenerateHolidaysDTO,
    @CurrentOrganizationId() organizationId: string,
  ) {
    return this.holidaysService.generate(body, organizationId);
  }

  /** Delete every holiday in one year. Year is required to prevent a blanket wipe. */
  @AllowAnonymous()
  @Delete()
  clearYear(
    @Query() query: ClearHolidaysQueryDTO,
    @CurrentOrganizationId() organizationId: string,
  ) {
    return this.holidaysService.clearYear(organizationId, query.year);
  }

  @AllowAnonymous()
  @Patch(':id')
  updateHoliday(
    @Param('id') id: string,
    @Body() body: UpdateHolidayDTO,
    @CurrentOrganizationId() organizationId: string,
  ) {
    return this.holidaysService.updateHoliday(id, body, organizationId);
  }

  @AllowAnonymous()
  @Delete(':id')
  deleteHoliday(@Param('id') id: string, @CurrentOrganizationId() organizationId: string) {
    return this.holidaysService.deleteHoliday(id, organizationId);
  }
}
