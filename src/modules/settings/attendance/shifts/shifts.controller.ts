import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';

import { CurrentOrganizationId } from '../../../../common/decorators/current-organization-id.decorator';
import { CreateShiftDTO } from './dto/create-shift.dto';
import { UpdateShiftDTO } from './dto/update-shift.dto';
import { ShiftsService } from './shifts.service';

@Controller('settings/attendance/shifts')
export class ShiftsController {
  constructor(private readonly shiftsService: ShiftsService) {}

  @AllowAnonymous()
  @Get()
  getShifts(@CurrentOrganizationId() organizationId: string) {
    return this.shiftsService.getShifts(organizationId);
  }

  @AllowAnonymous()
  @Post()
  createShift(@Body() body: CreateShiftDTO, @CurrentOrganizationId() organizationId: string) {
    return this.shiftsService.createShift(body, organizationId);
  }

  @AllowAnonymous()
  @Patch(':id')
  updateShift(
    @Param('id') id: string,
    @Body() body: UpdateShiftDTO,
    @CurrentOrganizationId() organizationId: string,
  ) {
    return this.shiftsService.updateShift(id, body, organizationId);
  }

  @AllowAnonymous()
  @Patch(':id/archive')
  archiveShift(@Param('id') id: string, @CurrentOrganizationId() organizationId: string) {
    return this.shiftsService.archiveShift(id, organizationId);
  }

  @AllowAnonymous()
  @Patch(':id/restore')
  restoreShift(@Param('id') id: string, @CurrentOrganizationId() organizationId: string) {
    return this.shiftsService.restoreShift(id, organizationId);
  }
}
