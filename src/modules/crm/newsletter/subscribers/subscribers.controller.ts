import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiCookieAuth, ApiCreatedResponse, ApiForbiddenResponse, ApiOperation, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { NewsletterSubscriber } from '@prisma/client';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';

import { CurrentOrganizationId } from '../../../../common/decorators/current-organization-id.decorator';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator';
import { PaginatedResponse } from '../../../../common/responses/paginated-api.response';
import { CreateSubscriberDTO } from './dto/create-subscriber.dto';
import { GetAllSubscribersQueryDTO } from './dto/get-all-subscribers-query.dto';
import { SubscribersService } from './subscribers.service';

@ApiTags('CRM - Subscribers')
@Controller('crm/newsletter/subscribers')
export class SubscribersController {
  constructor(private readonly subscribersService: SubscribersService) {}

  @AllowAnonymous()
  @Post()
  @ApiOperation({ summary: 'Create a subscriber for the default Geoplan organization (public website form)' })
  @ApiCreatedResponse({ description: 'Created subscriber.' })
  async createSubscriber(
    @Body() body: CreateSubscriberDTO,
  ): Promise<NewsletterSubscriber> {
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
  ): Promise<PaginatedResponse<NewsletterSubscriber>> {
    return this.subscribersService.getAllSubscribers(query, organizationId, userId);
  }
}
