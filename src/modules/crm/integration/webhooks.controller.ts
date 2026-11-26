import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiCookieAuth, ApiForbiddenResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { OrgRoles } from '@thallesp/nestjs-better-auth';

import { CurrentOrganizationId } from '../../../common/decorators/current-organization-id.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { ListQueryDTO } from '../../../common/dto/list-query.dto';
import { CreateWebhookEndpointDTO, UpdateWebhookEndpointDTO } from './dto/webhook-endpoint.dto';
import { WebhooksService } from './webhooks.service';

@ApiTags('Settings - Website webhooks')
@ApiCookieAuth()
@ApiForbiddenResponse({ description: 'Owner or admin required.' })
@OrgRoles(['owner', 'admin'])
@Controller('settings/website/webhooks')
export class WebhooksController {
  constructor(private readonly webhooks: WebhooksService) {}

  @Get()
  @ApiOperation({ summary: 'List webhook endpoints. Secrets are not returned.' })
  async listWebhookEndpoints(
    @CurrentOrganizationId() organizationId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.webhooks.listWebhookEndpoints(organizationId, userId);
  }

  @Post()
  @ApiOperation({ summary: 'Create a webhook endpoint. The secret is shown once.' })
  async createWebhookEndpoint(
    @Body() body: CreateWebhookEndpointDTO,
    @CurrentOrganizationId() organizationId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.webhooks.createWebhookEndpoint(body, organizationId, userId);
  }

  @Get(':id/deliveries')
  @ApiOperation({ summary: 'List delivery attempts for a webhook endpoint' })
  async listWebhookDeliveries(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: ListQueryDTO,
    @CurrentOrganizationId() organizationId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.webhooks.listWebhookDeliveries(id, query, organizationId, userId);
  }

  @Post(':id/rotate-secret')
  @ApiOperation({ summary: 'Rotate the webhook signing secret. Shown once.' })
  async rotateWebhookSecret(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentOrganizationId() organizationId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.webhooks.rotateWebhookSecret(id, organizationId, userId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a webhook endpoint without its secret' })
  async getWebhookEndpoint(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentOrganizationId() organizationId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.webhooks.getWebhookEndpoint(id, organizationId, userId);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a webhook endpoint' })
  async updateWebhookEndpoint(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateWebhookEndpointDTO,
    @CurrentOrganizationId() organizationId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.webhooks.updateWebhookEndpoint(id, body, organizationId, userId);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a webhook endpoint' })
  async deleteWebhookEndpoint(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentOrganizationId() organizationId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.webhooks.deleteWebhookEndpoint(id, organizationId, userId);
  }
}
