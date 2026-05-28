import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { StatusesService } from './statuses.service';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';
import { CreateStatusDTO } from './dto/create-status.dto';
import { UpdateStatusDTO } from './dto/update-status.dto';

@Controller('settings/statuses')
export class StatusesController {
  constructor(private readonly statusesService: StatusesService) {}

  @AllowAnonymous()
  @Post()
  async createStatus(@Body() body: CreateStatusDTO) {
    return this.statusesService.createStatus(body);
  }


  @AllowAnonymous()
  @Patch(':id')
  async updateStatus(@Param('id') id: string, @Body() data: UpdateStatusDTO) {
    return this.statusesService.updateStatus(id, data);
  }

  @AllowAnonymous()
  @Delete(':id')
  async deleteStatus(@Param('id') id: string) {
    return this.statusesService.deleteStatus(id);
  }

  @AllowAnonymous()
  @Get()
  async getStatusesByOrganization(@Query('organizationId') organizationId: string) {
    return this.statusesService.getStatusesByOrganization(organizationId);
  }
}
