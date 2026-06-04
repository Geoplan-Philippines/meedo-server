import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';

import { TicketsService } from './tickets.service';
import { CreateTicketDTO } from './dto/create-ticket.dto';
import { UpdateTicketDTO } from './dto/update-ticket.dto';
import { GetAllTicketsQueryDTO } from './dto/get-all-tickets-query.dto';
import { CurrentOrganizationId } from '../../common/decorators/current-organization-id.decorator';

@Controller('tickets')
export class TicketsController {
  constructor(private readonly ticketsService: TicketsService) {}

  @AllowAnonymous()
  @Get()
  async getAllTickets(@Query() query: GetAllTicketsQueryDTO, @CurrentOrganizationId() organizationId: string) {
    return this.ticketsService.getAllTickets(query, organizationId);
  }

  @AllowAnonymous()
  @Post()
  async createTicket(@Body() body: CreateTicketDTO, @CurrentOrganizationId() organizationId: string) {
    return this.ticketsService.createTicket(body, organizationId);
  }

  @AllowAnonymous()
  @Patch(':id')
  async updateTicket(@Param('id') id: string, @Body() body: UpdateTicketDTO, @CurrentOrganizationId() organizationId: string) {
    return this.ticketsService.updateTicket(id, body, organizationId);
  }
}
