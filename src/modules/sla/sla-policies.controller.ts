import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';
import { IsNotEmpty, IsString, IsUrl, MaxLength } from 'class-validator';

import { CurrentOrganizationId } from '../../common/decorators/current-organization-id.decorator';
import { SlaPoliciesService } from './sla-policies.service';
import { CreateSlaPolicyDTO } from './dto/create-sla-policy.dto';
import { UpdateSlaPolicyDTO } from './dto/update-sla-policy.dto';
import { GetAllSlaPoliciesQueryDTO } from './dto/get-all-sla-policies-query.dto';

class UpdateDocumentDTO {
  @IsString()
  @IsNotEmpty()
  @IsUrl()
  @MaxLength(500)
  documentUrl!: string;
}

@ApiTags('SLA Policies')
@ApiSecurity('x-org-id')
@Controller('sla-policies')
export class SlaPoliciesController {
  constructor(private readonly slaPoliciesService: SlaPoliciesService) {}

  @AllowAnonymous()
  @Get()
  @ApiOperation({ summary: 'List all SLA policies for the organization' })
  @ApiResponse({ status: 200, description: 'Returns paginated SLA policies' })
  async getAllSlaPolicies(
    @Query() query: GetAllSlaPoliciesQueryDTO,
    @CurrentOrganizationId() organizationId: string,
  ) {
    return this.slaPoliciesService.getAllSlaPolicies(query, organizationId);
  }

  @AllowAnonymous()
  @Get(':id')
  @ApiOperation({ summary: 'Get a single SLA policy by ID' })
  @ApiResponse({ status: 200, description: 'Returns the SLA policy' })
  @ApiResponse({ status: 404, description: 'SLA policy not found' })
  async getSlaPolicyById(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentOrganizationId() organizationId: string,
  ) {
    return this.slaPoliciesService.getSlaPolicyById(id, organizationId);
  }

  @AllowAnonymous()
  @Post()
  @ApiOperation({ summary: 'Create a new SLA policy' })
  @ApiResponse({ status: 201, description: 'SLA policy created' })
  @ApiResponse({ status: 409, description: 'Policy already exists for this org and project' })
  async createSlaPolicy(
    @Body() body: CreateSlaPolicyDTO,
    @CurrentOrganizationId() organizationId: string,
  ) {
    return this.slaPoliciesService.createSlaPolicy(body, organizationId);
  }

  @AllowAnonymous()
  @Patch(':id')
  @ApiOperation({ summary: 'Update an SLA policy' })
  @ApiResponse({ status: 200, description: 'SLA policy updated' })
  @ApiResponse({ status: 404, description: 'SLA policy not found' })
  async updateSlaPolicy(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateSlaPolicyDTO,
    @CurrentOrganizationId() organizationId: string,
  ) {
    return this.slaPoliciesService.updateSlaPolicy(id, body, organizationId);
  }

  @AllowAnonymous()
  @Patch(':id/document')
  @ApiOperation({ summary: 'Update the document URL of an SLA policy' })
  @ApiResponse({ status: 200, description: 'Document URL updated' })
  @ApiResponse({ status: 404, description: 'SLA policy not found' })
  async updateDocument(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateDocumentDTO,
    @CurrentOrganizationId() organizationId: string,
  ) {
    return this.slaPoliciesService.updateSlaPolicyDocument(id, organizationId, body.documentUrl);
  }

  @AllowAnonymous()
  @Delete(':id/document')
  @ApiOperation({ summary: 'Remove the document from an SLA policy' })
  @ApiResponse({ status: 200, description: 'Document removed' })
  @ApiResponse({ status: 400, description: 'No document attached' })
  @ApiResponse({ status: 404, description: 'SLA policy not found' })
  async removeDocument(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentOrganizationId() organizationId: string,
  ) {
    return this.slaPoliciesService.removeSlaPolicyDocument(id, organizationId);
  }

  @AllowAnonymous()
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Archive an SLA policy' })
  @ApiResponse({ status: 204, description: 'SLA policy archived' })
  @ApiResponse({ status: 404, description: 'SLA policy not found' })
  async deleteSlaPolicy(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentOrganizationId() organizationId: string,
  ) {
    return this.slaPoliciesService.deleteSlaPolicy(id, organizationId);
  }
}
