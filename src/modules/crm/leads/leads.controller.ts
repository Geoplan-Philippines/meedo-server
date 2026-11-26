import { Body, Controller, Get, Header, Param, ParseUUIDPipe, Patch, Post, Query, Res, StreamableFile } from '@nestjs/common';
import { ApiCookieAuth, ApiCreatedResponse, ApiForbiddenResponse, ApiOkResponse, ApiOperation, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { Lead } from '@prisma/client';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';
import type { Response } from 'express';

import { CurrentOrganizationId } from '../../../common/decorators/current-organization-id.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { PaginatedResponse } from '../../../common/responses/paginated-api.response';
import { ChangeLeadStatusDTO } from './dto/change-lead-status.dto';
import { CreateLeadDTO } from './dto/create-lead.dto';
import { GetAllLeadsQueryDTO } from './dto/get-all-leads-query.dto';
import { LeadValuesDTO } from './dto/lead-values.dto';
import { LeadsService } from './leads.service';

@ApiTags('CRM - Leads')
@Controller('crm/leads')
export class LeadsController {
  constructor(private readonly leadsService: LeadsService) {}

  @Get('stats')
  @ApiCookieAuth()
  @ApiOperation({ summary: 'Lead counts by status for the active organization' })
  @ApiOkResponse({ description: 'Total and NEW, CONTACTED, QUALIFIED, LOST counts for non-archived leads.' })
  @ApiUnauthorizedResponse({ description: 'Authentication required.' })
  @ApiForbiddenResponse({ description: 'No active organization or membership.' })
  async getStats(
    @CurrentOrganizationId() organizationId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.leadsService.getStats(organizationId, userId);
  }

  @Get('export')
  @ApiCookieAuth()
  @Header('Content-Type', 'text/csv')
  @ApiOperation({ summary: 'Export filtered leads as CSV' })
  async exportLeads(
    @Query() query: GetAllLeadsQueryDTO,
    @CurrentOrganizationId() organizationId: string,
    @CurrentUser('id') userId: string,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    const exported = await this.leadsService.exportLeads(query, organizationId, userId);
    response.setHeader('Content-Disposition', `attachment; filename="${exported.filename}"`);
    return exported.file;
  }

  @AllowAnonymous()
  @Post()
  @ApiOperation({ summary: 'Create a lead for the default Geoplan organization (public website form)' })
  @ApiCreatedResponse({ description: 'Created lead.' })
  async createLead(@Body() body: CreateLeadDTO): Promise<Lead> {
    return this.leadsService.createLead(body);
  }

  @Post('manual')
  @ApiCookieAuth()
  @ApiOperation({ summary: 'Create a lead from dashboard values' })
  @ApiCreatedResponse({ description: 'Created lead.' })
  async createLeadManual(
    @Body() body: LeadValuesDTO,
    @CurrentOrganizationId() organizationId: string,
    @CurrentUser('id') userId: string,
  ): Promise<Lead> {
    return this.leadsService.createLeadManual(body, organizationId, userId);
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

  @Get(':id')
  @ApiCookieAuth()
  @ApiOperation({ summary: 'Get a lead in the active organization' })
  async getLead(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentOrganizationId() organizationId: string,
    @CurrentUser('id') userId: string,
  ): Promise<Lead> {
    return this.leadsService.getLead(id, organizationId, userId);
  }

  @Patch(':id')
  @ApiCookieAuth()
  @ApiOperation({ summary: 'Update lead field values' })
  async updateLeadValues(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: LeadValuesDTO,
    @CurrentOrganizationId() organizationId: string,
    @CurrentUser('id') userId: string,
  ): Promise<Lead> {
    return this.leadsService.updateLeadValues(id, body, organizationId, userId);
  }

  @Patch(':id/status')
  @ApiCookieAuth()
  @ApiOperation({ summary: 'Change lead status' })
  async changeLeadStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ChangeLeadStatusDTO,
    @CurrentOrganizationId() organizationId: string,
    @CurrentUser('id') userId: string,
  ): Promise<Lead> {
    return this.leadsService.changeLeadStatus(id, body, organizationId, userId);
  }

  @Patch(':id/archive')
  @ApiCookieAuth()
  @ApiOperation({ summary: 'Archive a lead without changing status' })
  async archiveLead(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentOrganizationId() organizationId: string,
    @CurrentUser('id') userId: string,
  ): Promise<Lead> {
    return this.leadsService.archiveLead(id, organizationId, userId);
  }

  @Patch(':id/restore')
  @ApiCookieAuth()
  @ApiOperation({ summary: 'Restore an archived lead at its previous status' })
  async restoreLead(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentOrganizationId() organizationId: string,
    @CurrentUser('id') userId: string,
  ): Promise<Lead> {
    return this.leadsService.restoreLead(id, organizationId, userId);
  }
}
