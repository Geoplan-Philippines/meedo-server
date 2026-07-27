import { Controller, Get, Post, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';
import { CurrentOrganizationId } from '../../../common/decorators/current-organization-id.decorator';
import { PaginatedResponse } from 'src/common/responses/paginated-api.response';
import { ProjectsService } from './projects.service';
import { GetAllProjectsQueryDTO } from './dto/get-all-projects-query.dto';
import { Project } from '@prisma/client';

@ApiTags('Projects')
@Controller('maintenance/projects')
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @AllowAnonymous()
  @Get()
  @ApiOperation({ summary: 'List projects', description: 'Paginated list of projects, optionally filtered by client.' })
  @ApiOkResponse({ description: 'Paginated projects with client info' })
  async getAllProjects(
    @Query() query: GetAllProjectsQueryDTO,
    @CurrentOrganizationId() organizationId: string,
  ): Promise<PaginatedResponse<Project>> {
    return this.projectsService.getAllProjects(query, organizationId);
  }

  @AllowAnonymous()
  @Post('sync')
  @ApiOperation({ summary: 'Sync projects from Apptivo' })
  @ApiOkResponse({ description: 'Sync result with synced/deleted counts' })
  async syncWorkOrders(
    @CurrentOrganizationId() organizationId: string,
  ): Promise<{ message: string; synced: number; deleted: number }> {
    const { synced, deleted } = await this.projectsService.syncWorkOrdersFromApptivo(organizationId);
    return { message: 'Sync complete', synced, deleted };
  }
}
