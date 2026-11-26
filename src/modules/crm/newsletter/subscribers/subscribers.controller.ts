import { Body, Controller, Get, Header, Param, ParseUUIDPipe, Patch, Post, Query, Res, StreamableFile } from '@nestjs/common';
import { ApiCookieAuth, ApiCreatedResponse, ApiForbiddenResponse, ApiOperation, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';
import type { Response } from 'express';

import { CurrentOrganizationId } from '../../../../common/decorators/current-organization-id.decorator';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator';
import { PaginatedResponse } from '../../../../common/responses/paginated-api.response';
import { CreateSubscriberDTO } from './dto/create-subscriber.dto';
import { GetAllSubscribersQueryDTO } from './dto/get-all-subscribers-query.dto';
import { SubscriberValuesDTO } from './dto/subscriber-values.dto';
import { type SubscriberResponse } from './subscriber-record';
import { SubscribersService } from './subscribers.service';

@ApiTags('CRM - Subscribers')
@Controller('crm/newsletter/subscribers')
export class SubscribersController {
  constructor(private readonly subscribersService: SubscribersService) {}

  @Get('stats')
  @ApiCookieAuth()
  @ApiOperation({ summary: 'New-this-month and unsubscribed counts for the active organization' })
  async getStats(
    @CurrentOrganizationId() organizationId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.subscribersService.getStats(organizationId, userId);
  }

  @Get('export')
  @ApiCookieAuth()
  @Header('Content-Type', 'text/csv')
  @ApiOperation({ summary: 'Export filtered subscribers as CSV' })
  async exportSubscribers(
    @Query() query: GetAllSubscribersQueryDTO,
    @CurrentOrganizationId() organizationId: string,
    @CurrentUser('id') userId: string,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    const exported = await this.subscribersService.exportSubscribers(query, organizationId, userId);
    response.setHeader('Content-Disposition', `attachment; filename="${exported.filename}"`);
    return exported.file;
  }

  @AllowAnonymous()
  @Post()
  @ApiOperation({ summary: 'Create a subscriber for the default Geoplan organization (public website form)' })
  @ApiCreatedResponse({ description: 'Created subscriber.' })
  async createSubscriber(
    @Body() body: CreateSubscriberDTO,
  ): Promise<SubscriberResponse> {
    return this.subscribersService.createSubscriber(body);
  }

  @Get()
  @ApiCookieAuth()
  @ApiOperation({ summary: 'List subscribers in the active organization' })
  @ApiUnauthorizedResponse({ description: 'Authentication required.' })
  @ApiForbiddenResponse({ description: 'No active organization or membership.' })
  async getAllSubscribers(
    @Query() query: GetAllSubscribersQueryDTO,
    @CurrentOrganizationId() organizationId: string,
    @CurrentUser('id') userId: string,
  ): Promise<PaginatedResponse<SubscriberResponse>> {
    return this.subscribersService.getAllSubscribers(query, organizationId, userId);
  }

  @Get(':id')
  @ApiCookieAuth()
  @ApiOperation({ summary: 'Get a subscriber in the active organization' })
  async getSubscriber(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentOrganizationId() organizationId: string,
    @CurrentUser('id') userId: string,
  ): Promise<SubscriberResponse> {
    return this.subscribersService.getSubscriber(id, organizationId, userId);
  }

  @Patch(':id')
  @ApiCookieAuth()
  @ApiOperation({ summary: 'Update subscriber field values' })
  async updateSubscriberValues(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: SubscriberValuesDTO,
    @CurrentOrganizationId() organizationId: string,
    @CurrentUser('id') userId: string,
  ): Promise<SubscriberResponse> {
    return this.subscribersService.updateSubscriberValues(id, body, organizationId, userId);
  }

  @Patch(':id/archive')
  @ApiCookieAuth()
  @ApiOperation({ summary: 'Archive a subscriber' })
  async archiveSubscriber(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentOrganizationId() organizationId: string,
    @CurrentUser('id') userId: string,
  ): Promise<SubscriberResponse> {
    return this.subscribersService.archiveSubscriber(id, organizationId, userId);
  }

  @Patch(':id/restore')
  @ApiCookieAuth()
  @ApiOperation({ summary: 'Restore an archived subscriber' })
  async restoreSubscriber(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentOrganizationId() organizationId: string,
    @CurrentUser('id') userId: string,
  ): Promise<SubscriberResponse> {
    return this.subscribersService.restoreSubscriber(id, organizationId, userId);
  }
}
