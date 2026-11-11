import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';

import { PaginatedResponse } from 'src/common/responses/paginated-api.response';
import { TicketsService } from './tickets.service';
import { CreateTicketDTO } from './dto/create-ticket.dto';
import { UpdateTicketDTO } from './dto/update-ticket.dto';
import { GetAllTicketsQueryDTO } from './dto/get-all-tickets-query.dto';
import { GetTicketFacetsQueryDTO } from './dto/get-ticket-facets-query.dto';
import { TicketDetail, TicketFacets, TicketStats, TicketWithRelations, WithSla } from './constants/ticket.constants';
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
    @CurrentUser('id') userId: string,
  ): Promise<PaginatedResponse<WithSla<TicketWithRelations>>> {
    return this.ticketsService.getAllTickets(query, organizationId, userId);
  }

  @AllowAnonymous()
  @Get('stats')
  async getTicketStats(
    @CurrentOrganizationId() organizationId: string,
    @CurrentUser('id') userId: string,
  ): Promise<TicketStats> {
    return this.ticketsService.getTicketStats(organizationId, userId);
  }

  @AllowAnonymous()
  @Get('facets')
  async getTicketFacets(
    @Query() query: GetTicketFacetsQueryDTO,
    @CurrentOrganizationId() organizationId: string,
    @CurrentUser('id') userId: string,
  ): Promise<TicketFacets> {
    return this.ticketsService.getFacets(query, organizationId, userId);
  }

  // Keep after the static GET routes ('stats' / 'facets') so ':id' doesn't capture them.
  @AllowAnonymous()
  @Get(':id')
  async getTicketById(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentOrganizationId() organizationId: string,
    @CurrentUser('id') userId: string,
  ): Promise<WithSla<TicketDetail>> {
    return this.ticketsService.getTicketById(id, organizationId, userId);
  }

  @AllowAnonymous()
  @Post()
  async createTicket(
    @Body() body: CreateTicketDTO,
    @CurrentOrganizationId() organizationId: string,
    @CurrentUser('id') userId: string,
  ): Promise<WithSla<TicketWithRelations>> {
    return this.ticketsService.createTicket(body, organizationId, userId);
  }

  @AllowAnonymous()
  @Patch(':id')
  async updateTicket(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateTicketDTO,
    @CurrentOrganizationId() organizationId: string,
    @CurrentUser('id') userId: string,
  ): Promise<WithSla<TicketDetail>> {
    return this.ticketsService.updateTicket(id, body, organizationId, userId);
  }
}
