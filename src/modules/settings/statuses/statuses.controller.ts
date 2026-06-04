import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { StatusesService } from './statuses.service';
import { CurrentOrganizationId } from '../../../common/decorators/current-organization-id.decorator';
import { CreateStatusDTO } from './dto/create-status.dto';
import { UpdateStatusDTO } from './dto/update-status.dto';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';

@Controller('settings/statuses')
export class StatusesController {
  constructor(private readonly statusesService: StatusesService) {}

  @AllowAnonymous()
  @Post()
  async createStatus(
    @Body() body: CreateStatusDTO,
    @CurrentOrganizationId() organizationId: string,
  ) {
    return this.statusesService.createStatus(body, organizationId);
  }

  @AllowAnonymous()
  @Patch(':id')
  async updateStatus(
    @Param('id') id: string,
    @Body() data: UpdateStatusDTO,
    @CurrentOrganizationId() organizationId: string,
  ) {
    return this.statusesService.updateStatus(id, data, organizationId);
  }

  @AllowAnonymous()
  @Patch(':id/archive')
  async archiveStatus(
    @Param('id') id: string,
    @CurrentOrganizationId() organizationId: string,
  ) {
    return this.statusesService.archiveStatus(id, organizationId);
  }

  @AllowAnonymous()
  @Patch(':id/restore')
  async restoreStatus(
    @Param('id') id: string,
    @CurrentOrganizationId() organizationId: string,
  ) {
    return this.statusesService.restoreStatus(id, organizationId);
  }

  @AllowAnonymous()
  @Get()
  async getStatusesByOrganization(@CurrentOrganizationId() organizationId: string) {
    return this.statusesService.getStatusesByOrganization(organizationId);
  }
}
