import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';

import { PaginatedResponse } from 'src/common/responses/paginated-api.response';
import { TicketsService } from './tickets.service';
import { CreateTicketDTO } from './dto/create-ticket.dto';
import { UpdateTicketDTO } from './dto/update-ticket.dto';
import { GetAllTicketsQueryDTO } from './dto/get-all-tickets-query.dto';
import { GetTicketFacetsQueryDTO } from './dto/get-ticket-facets-query.dto';
import { TicketDetail, TicketFacets, TicketStats, TicketWithRelations } from './constants/ticket.constants';
import { CurrentOrganizationId } from '../../common/decorators/current-organization-id.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@Controller('tickets')
export class TicketsController {
  constructor(private readonly ticketsService: TicketsService) {}

  @AllowAnonymous()
  @Get()
  async getAllTickets(
    @Query() query: GetAllTicketsQueryDTO,
    @CurrentOrganizationId() organizationId: string,
  ): Promise<PaginatedResponse<TicketWithRelations>> {
    return this.ticketsService.getAllTickets(query, organizationId);
  }

  @AllowAnonymous()
  @Get('stats')
  async getTicketStats(@CurrentOrganizationId() organizationId: string): Promise<TicketStats> {
    return this.ticketsService.getTicketStats(organizationId);
  }

  @AllowAnonymous()
  @Get('facets')
  async getTicketFacets(
    @Query() query: GetTicketFacetsQueryDTO,
    @CurrentOrganizationId() organizationId: string,
  ): Promise<TicketFacets> {
    return this.ticketsService.getFacets(query, organizationId);
  }

  // Keep after the static GET routes ('stats' / 'facets') so ':id' doesn't capture them.
  @AllowAnonymous()
  @Get(':id')
  async getTicketById(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentOrganizationId() organizationId: string,
  ): Promise<TicketDetail> {
    return this.ticketsService.getTicketById(id, organizationId);
  }

  @AllowAnonymous()
  @Post()
  async createTicket(
    @Body() body: CreateTicketDTO,
    @CurrentOrganizationId() organizationId: string,
    @CurrentUser('id') userId: string,
  ): Promise<TicketWithRelations> {
    return this.ticketsService.createTicket(body, organizationId, userId);
  }

  @AllowAnonymous()
  @Patch(':id')
  async updateTicket(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateTicketDTO,
    @CurrentOrganizationId() organizationId: string,
    @CurrentUser('id') userId: string,
  ): Promise<TicketDetail> {
    return this.ticketsService.updateTicket(id, body, organizationId, userId);
  }

  @AllowAnonymous()
  @Post(':id/archive')
  async archiveTicket(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentOrganizationId() organizationId: string,
    @CurrentUser('id') userId: string,
  ): Promise<TicketDetail> {
    return this.ticketsService.archiveTicket(id, organizationId, userId);
  }

  @AllowAnonymous()
  @Post(':id/restore')
  async restoreTicket(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentOrganizationId() organizationId: string,
    @CurrentUser('id') userId: string,
  ): Promise<TicketDetail> {
    return this.ticketsService.restoreTicket(id, organizationId, userId);
  }

  @AllowAnonymous()
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteTicket(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentOrganizationId() organizationId: string,
  ): Promise<void> {
    return this.ticketsService.deleteTicket(id, organizationId);
  }
}
