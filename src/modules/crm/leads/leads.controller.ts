import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiCookieAuth, ApiCreatedResponse, ApiForbiddenResponse, ApiOkResponse, ApiOperation, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { Lead } from '@prisma/client';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';

import { CurrentOrganizationId } from '../../../common/decorators/current-organization-id.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { PaginatedResponse } from '../../../common/responses/paginated-api.response';
import { CreateLeadDTO } from './dto/create-lead.dto';
import { GetAllLeadsQueryDTO } from './dto/get-all-leads-query.dto';
import { LeadsService } from './leads.service';

@ApiTags('CRM - Leads')
@Controller('crm/leads')
export class LeadsController {
  constructor(private readonly leadsService: LeadsService) {}

  @Get('stats')
  @ApiCookieAuth()
  @ApiOperation({ summary: 'Lead counts by status for the active organization' })
  @ApiOkResponse({ description: 'Total and NEW, CONTACTED, QUALIFIED, LOST counts.' })
  @ApiUnauthorizedResponse({ description: 'Authentication required.' })
  @ApiForbiddenResponse({ description: 'No active organization or membership.' })
  async getStats(
    @CurrentOrganizationId() organizationId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.leadsService.getStats(organizationId, userId);
  }

  @AllowAnonymous()
  @Post()
  @ApiOperation({ summary: 'Create a lead for the default Geoplan organization (public website form)' })
  @ApiCreatedResponse({ description: 'Created lead.' })
  async createLead(@Body() body: CreateLeadDTO): Promise<Lead> {
    return this.leadsService.createLead(body);
  }

  @Get()
  @ApiCookieAuth()
  @ApiOperation({ summary: 'List leads in the active organization' })
  @ApiUnauthorizedResponse({ description: 'Authentication required.' })
  @ApiForbiddenResponse({ description: 'No active organization or membership.' })
  async getAllLeads(
    @Query() query: GetAllLeadsQueryDTO,
    @CurrentOrganizationId() organizationId: string,
    @CurrentUser('id') userId: string,
  ): Promise<PaginatedResponse<Lead>> {
    return this.leadsService.getAllLeads(query, organizationId, userId);
  }
}
