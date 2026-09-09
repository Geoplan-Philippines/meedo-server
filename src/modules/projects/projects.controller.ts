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
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';

import { PaginatedResponse } from 'src/common/responses/paginated-api.response';
import { CurrentOrganizationId } from '../../common/decorators/current-organization-id.decorator';
import { ProjectsService } from './projects.service';
import { CreateProjectDTO } from './dto/create-project.dto';
import { UpdateProjectDTO } from './dto/update-project.dto';
import { GetAllProjectsQueryDTO } from './dto/get-all-projects-query.dto';
import { ProjectWithRelations } from './constants/project.constants';

@ApiTags('Projects')
@Controller('projects')
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @AllowAnonymous()
  @Get()
  @ApiOperation({ summary: 'List projects' })
  async getAllProjects(
    @Query() query: GetAllProjectsQueryDTO,
    @CurrentOrganizationId() organizationId: string,
  ): Promise<PaginatedResponse<ProjectWithRelations>> {
    return this.projectsService.getAllProjects(query, organizationId);
  }

  // Keep ahead of ':id' so the literal path isn't captured as a UUID param.
  @AllowAnonymous()
  @Get('internal')
  @ApiOperation({
    summary: 'Get the organization internal project',
    description: 'Returns the catch-all project for non-client work, creating it on first use.',
  })
  async getInternalProject(
    @CurrentOrganizationId() organizationId: string,
  ): Promise<ProjectWithRelations> {
    return this.projectsService.getInternalProject(organizationId);
  }

  // Keep ahead of ':id' — literal path, not a project UUID.
  @AllowAnonymous()
  @Get('for-work-order/:workOrderId')
  @ApiOperation({
    summary: 'Get or create the project for a work order',
    description:
      'Returns the delivery project linked to an Apptivo work order, creating it on first use.',
  })
  async getProjectForWorkOrder(
    @Param('workOrderId', ParseUUIDPipe) workOrderId: string,
    @CurrentOrganizationId() organizationId: string,
  ): Promise<ProjectWithRelations> {
    return this.projectsService.ensureProjectForWorkOrder(workOrderId, organizationId);
  }

  @AllowAnonymous()
  @Get(':id')
  @ApiOperation({ summary: 'Get a project' })
  async getProjectById(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentOrganizationId() organizationId: string,
  ): Promise<ProjectWithRelations> {
    return this.projectsService.getProjectById(id, organizationId);
  }

  @AllowAnonymous()
  @Post()
  @ApiOperation({ summary: 'Create a project' })
  async createProject(
    @Body() body: CreateProjectDTO,
    @CurrentOrganizationId() organizationId: string,
  ): Promise<ProjectWithRelations> {
    return this.projectsService.createProject(body, organizationId);
  }

  @AllowAnonymous()
  @Patch(':id')
  @ApiOperation({ summary: 'Update a project' })
  async updateProject(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateProjectDTO,
    @CurrentOrganizationId() organizationId: string,
  ): Promise<ProjectWithRelations> {
    return this.projectsService.updateProject(id, body, organizationId);
  }

  @AllowAnonymous()
  @Post(':id/archive')
  @ApiOperation({ summary: 'Archive a project' })
  async archiveProject(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentOrganizationId() organizationId: string,
  ): Promise<ProjectWithRelations> {
    return this.projectsService.archiveProject(id, organizationId);
  }

  @AllowAnonymous()
  @Post(':id/restore')
  @ApiOperation({ summary: 'Restore an archived project' })
  async restoreProject(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentOrganizationId() organizationId: string,
  ): Promise<ProjectWithRelations> {
    return this.projectsService.restoreProject(id, organizationId);
  }

  @AllowAnonymous()
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Delete an empty project',
    description: 'Only projects with no tickets can be deleted. Archive anything with history.',
  })
  async deleteProject(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentOrganizationId() organizationId: string,
  ): Promise<void> {
    return this.projectsService.deleteProject(id, organizationId);
  }
}
