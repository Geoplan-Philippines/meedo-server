import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBadRequestResponse, ApiCookieAuth, ApiCreatedResponse, ApiForbiddenResponse, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { OrgRoles } from '@thallesp/nestjs-better-auth';
import { CurrentOrganizationId } from '../../../../common/decorators/current-organization-id.decorator';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator';
import { CampaignsService } from './campaigns.service';
import { CampaignListResponseDTO, CampaignResponseDTO } from './dto/campaign-response.dto';
import { CreateCampaignDTO } from './dto/create-campaign.dto';
import { GetAllCampaignsQueryDTO } from './dto/get-all-campaigns-query.dto';
import { UpdateCampaignDTO } from './dto/update-campaign.dto';

@ApiTags('CRM campaigns')
@ApiCookieAuth()
@ApiForbiddenResponse({ description: 'Authentication, active organization, membership, or required role missing.' })
@ApiBadRequestResponse({ description: 'Invalid input or attempt to edit an archived campaign.' })
@ApiNotFoundResponse({ description: 'Campaign not found in the active organization.' })
@Controller('crm/newsletter/campaigns')
export class CampaignsController {
  constructor(private readonly campaigns: CampaignsService) {}

  @Get()
  @ApiOperation({ summary: 'List organization campaigns; drafts only by default' })
  @ApiOkResponse({ type: CampaignListResponseDTO })
  list(@Query() query: GetAllCampaignsQueryDTO, @CurrentOrganizationId() organizationId: string, @CurrentUser('id') userId: string) {
    return this.campaigns.list(query, organizationId, userId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get an organization campaign' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ type: CampaignResponseDTO })
  get(@Param('id', ParseUUIDPipe) id: string, @CurrentOrganizationId() organizationId: string, @CurrentUser('id') userId: string) {
    return this.campaigns.get(id, organizationId, userId);
  }

  @Post()
  @OrgRoles(['owner', 'admin'])
  @ApiOperation({ summary: 'Create a draft (owner/admin)' })
  @ApiCreatedResponse({ type: CampaignResponseDTO })
  create(@Body() body: CreateCampaignDTO, @CurrentOrganizationId() organizationId: string, @CurrentUser('id') userId: string) {
    return this.campaigns.create(body, organizationId, userId);
  }

  @Patch(':id')
  @OrgRoles(['owner', 'admin'])
  @ApiOperation({ summary: 'Update a draft (owner/admin)' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ type: CampaignResponseDTO })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() body: UpdateCampaignDTO, @CurrentOrganizationId() organizationId: string, @CurrentUser('id') userId: string) {
    return this.campaigns.update(id, body, organizationId, userId);
  }

  @Patch(':id/archive')
  @OrgRoles(['owner', 'admin'])
  @ApiOperation({ summary: 'Archive a campaign (owner/admin)' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ type: CampaignResponseDTO })
  archive(@Param('id', ParseUUIDPipe) id: string, @CurrentOrganizationId() organizationId: string, @CurrentUser('id') userId: string) {
    return this.campaigns.archive(id, organizationId, userId);
  }

  @Patch(':id/restore')
  @OrgRoles(['owner', 'admin'])
  @ApiOperation({ summary: 'Restore a campaign to draft (owner/admin)' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ type: CampaignResponseDTO })
  restore(@Param('id', ParseUUIDPipe) id: string, @CurrentOrganizationId() organizationId: string, @CurrentUser('id') userId: string) {
    return this.campaigns.restore(id, organizationId, userId);
  }
}
