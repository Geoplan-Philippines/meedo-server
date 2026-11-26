import { Controller, Delete, Get, Post } from '@nestjs/common';
import { ApiCookieAuth, ApiForbiddenResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { OrgRoles } from '@thallesp/nestjs-better-auth';

import { CurrentOrganizationId } from '../../../common/decorators/current-organization-id.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { IntegrationKeysService } from './integration-keys.service';

@ApiTags('Settings - Website integration key')
@ApiCookieAuth()
@ApiForbiddenResponse({ description: 'Authentication, membership, or required role missing.' })
@Controller('settings/website/integration-key')
export class IntegrationKeysController {
  constructor(private readonly keys: IntegrationKeysService) {}

  @Get()
  @ApiOperation({ summary: 'Read the integration key prefix. The full key is never returned.' })
  async getIntegrationKey(
    @CurrentOrganizationId() organizationId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.keys.getIntegrationKey(organizationId, userId);
  }

  @Post()
  @OrgRoles(['owner', 'admin'])
  @ApiOperation({ summary: 'Create or rotate the integration key. The full key is shown once.' })
  @ApiOkResponse({ description: '{ key, prefix, createdAt }' })
  async rotateIntegrationKey(
    @CurrentOrganizationId() organizationId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.keys.rotateIntegrationKey(organizationId, userId);
  }

  @Delete()
  @OrgRoles(['owner', 'admin'])
  @ApiOperation({ summary: 'Revoke the integration key immediately.' })
  async revokeIntegrationKey(
    @CurrentOrganizationId() organizationId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.keys.revokeIntegrationKey(organizationId, userId);
  }
}
