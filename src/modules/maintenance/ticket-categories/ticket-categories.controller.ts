import { Body, Controller, Get, Post, Patch, Delete, Param, ParseUUIDPipe } from '@nestjs/common';

import { TicketCategory } from '@prisma/client';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';

import { TicketCategoriesService } from './services/ticket-categories.service';
import { CreateTicketCategoryDTO } from './dto/create-ticket-category.dto';
import { UpdateTicketCategoryDTO } from './dto/update-ticket-category.dto';
import { CurrentOrganizationId } from '../../../common/decorators/current-organization-id.decorator';

@Controller('maintenance/ticket-categories')
export class TicketCategoriesController {
  constructor(private readonly ticketCategoriesService: TicketCategoriesService) {}

  @AllowAnonymous()
  @Post()
  async createTicketCategory(
    @Body() body: CreateTicketCategoryDTO,
    @CurrentOrganizationId() organizationId: string,
  ): Promise<TicketCategory> {
    return this.ticketCategoriesService.createTicketCategory(body, organizationId);
  }

  @AllowAnonymous()
  @Get()
  async getAllTicketCategories(
    @CurrentOrganizationId() organizationId: string,
  ): Promise<TicketCategory[]> {
    return this.ticketCategoriesService.getAllTicketCategories(organizationId);
  }

  @AllowAnonymous()
  @Patch(':id')
  async updateTicketCategory(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateTicketCategoryDTO,
    @CurrentOrganizationId() organizationId: string,
  ): Promise<TicketCategory> {
    return this.ticketCategoriesService.updateTicketCategory(id, body, organizationId);
  }

  @AllowAnonymous()
  @Delete(':id')
  async deleteTicketCategory(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentOrganizationId() organizationId: string,
  ): Promise<TicketCategory> {
    return this.ticketCategoriesService.deleteTicketCategory(id, organizationId);
  }
}
