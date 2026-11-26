import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiCookieAuth, ApiCreatedResponse, ApiForbiddenResponse, ApiOkResponse, ApiOperation, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { FieldDefinition } from '@prisma/client';
import { OrgRoles } from '@thallesp/nestjs-better-auth';

import { CurrentOrganizationId } from '../../../common/decorators/current-organization-id.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { CreateFieldDefinitionDTO } from './dto/create-field-definition.dto';
import { GetFieldDefinitionsQueryDTO } from './dto/get-field-definitions-query.dto';
import { ReorderFieldDefinitionsDTO } from './dto/reorder-field-definitions.dto';
import { UpdateFieldDefinitionDTO } from './dto/update-field-definition.dto';
import { FieldDefinitionsService } from './field-definitions.service';

@ApiTags('CRM - Field definitions')
@ApiCookieAuth()
@ApiUnauthorizedResponse({ description: 'Authentication required.' })
@ApiForbiddenResponse({ description: 'No active organization, membership, or required role.' })
@Controller('crm/field-definitions')
export class FieldDefinitionsController {
  constructor(private readonly fieldDefinitions: FieldDefinitionsService) {}

  @Get()
  @ApiOperation({ summary: 'List field definitions for a collection' })
  @ApiOkResponse({ description: 'Field definitions in position order.' })
  async getFieldDefinitions(
    @Query() query: GetFieldDefinitionsQueryDTO,
    @CurrentOrganizationId() organizationId: string,
    @CurrentUser('id') userId: string,
  ): Promise<FieldDefinition[]> {
    return this.fieldDefinitions.getFieldDefinitions(query, organizationId, userId);
  }

  @Post()
  @OrgRoles(['owner', 'admin'])
  @ApiOperation({ summary: 'Create a custom field (owner/admin)' })
  @ApiCreatedResponse({ description: 'Created field definition.' })
  async createFieldDefinition(
    @Body() body: CreateFieldDefinitionDTO,
    @CurrentOrganizationId() organizationId: string,
    @CurrentUser('id') userId: string,
  ): Promise<FieldDefinition> {
    return this.fieldDefinitions.createFieldDefinition(body, organizationId, userId);
  }

  @Patch('reorder')
  @OrgRoles(['owner', 'admin'])
  @ApiOperation({ summary: 'Reorder fields in a collection (owner/admin)' })
  async reorderFieldDefinitions(
    @Body() body: ReorderFieldDefinitionsDTO,
    @CurrentOrganizationId() organizationId: string,
    @CurrentUser('id') userId: string,
  ): Promise<FieldDefinition[]> {
    return this.fieldDefinitions.reorderFieldDefinitions(body, organizationId, userId);
  }

  @Patch(':id')
  @OrgRoles(['owner', 'admin'])
  @ApiOperation({ summary: 'Update a custom field (owner/admin)' })
  async updateFieldDefinition(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateFieldDefinitionDTO,
    @CurrentOrganizationId() organizationId: string,
    @CurrentUser('id') userId: string,
  ): Promise<FieldDefinition> {
    return this.fieldDefinitions.updateFieldDefinition(id, body, organizationId, userId);
  }

  @Delete(':id')
  @OrgRoles(['owner', 'admin'])
  @ApiOperation({ summary: 'Delete a custom field and strip stored values (owner/admin)' })
  async deleteFieldDefinition(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentOrganizationId() organizationId: string,
    @CurrentUser('id') userId: string,
  ): Promise<{ id: string }> {
    return this.fieldDefinitions.deleteFieldDefinition(id, organizationId, userId);
  }
}
