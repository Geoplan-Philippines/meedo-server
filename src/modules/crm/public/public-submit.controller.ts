import { Body, Controller, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { ApiCreatedResponse, ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';
import { Throttle } from '@nestjs/throttler';

import { CurrentIntegrationOrganization } from '../integration/current-integration-organization.decorator';
import { IntegrationKeyGuard } from '../integration/integration-key.guard';
import { PublicSubmitDTO } from './dto/public-submit.dto';
import { PublicSubmitService } from './public-submit.service';

@ApiTags('Public submit')
@AllowAnonymous()
@UseGuards(IntegrationKeyGuard)
@Throttle({ default: { limit: 10, ttl: 60_000 } })
@Controller('public/:orgSlug')
export class PublicSubmitController {
  constructor(private readonly publicSubmit: PublicSubmitService) {}

  @Post('leads')
  @AllowAnonymous()
  @HttpCode(201)
  @ApiHeader({ name: 'x-integration-key', required: true })
  @ApiOperation({ summary: 'Submit a lead with an organization integration key' })
  @ApiCreatedResponse({ description: '{ id } of the created lead, or a discarded honeypot.' })
  async submitLead(
    @Param('orgSlug') _orgSlug: string,
    @CurrentIntegrationOrganization('id') organizationId: string,
    @Body() body: PublicSubmitDTO,
  ): Promise<{ id: string }> {
    return this.publicSubmit.submitLead(organizationId, body);
  }

  @Post('subscribers')
  @AllowAnonymous()
  @HttpCode(201)
  @ApiHeader({ name: 'x-integration-key', required: true })
  @ApiOperation({ summary: 'Submit a subscriber with an organization integration key' })
  @ApiCreatedResponse({ description: '{ id } of the subscriber, or a discarded honeypot.' })
  async submitSubscriber(
    @Param('orgSlug') _orgSlug: string,
    @CurrentIntegrationOrganization('id') organizationId: string,
    @Body() body: PublicSubmitDTO,
  ): Promise<{ id: string }> {
    return this.publicSubmit.submitSubscriber(organizationId, body);
  }
}
