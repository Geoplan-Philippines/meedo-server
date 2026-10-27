import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiForbiddenResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AllowAnonymous, OrgRoles, Session } from '@thallesp/nestjs-better-auth';
import type { UserSession } from '@thallesp/nestjs-better-auth';
import { CurrentOrganizationId } from '../../../common/decorators/current-organization-id.decorator';
import { getActiveOrganizationId } from '../../../common/utils/active-organization';
import { PaginatedResponse } from 'src/common/responses/paginated-api.response';
import { ApiPaginatedResponse } from '../../../common/decorators/api-paginated-response.decorator';
import { ProjectsService, type ProjectDetail, type ProjectView } from './projects.service';
import { GetAllProjectsQueryDTO } from './dto/get-all-projects-query.dto';
import { ProjectDetailDTO, ProjectResponseDTO } from './dto/project-response.dto';
import { ProjectSyncResultDTO } from './dto/sync-result.dto';
import { UpdateProjectDTO } from './dto/update-project.dto';

@ApiTags('Projects')
@Controller('maintenance/projects')
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @AllowAnonymous()
  @Get()
  @ApiOperation({
    summary: 'List projects',
    description: 'Paginated list of projects. Search matches display name, quote subject and WO number.',
  })
  @ApiPaginatedResponse(ProjectResponseDTO)
  async getAllProjects(
    @Query() query: GetAllProjectsQueryDTO,
    @CurrentOrganizationId() organizationId: string,
  ): Promise<PaginatedResponse<ProjectView>> {
    return this.projectsService.getAllProjects(query, organizationId);
  }

  @AllowAnonymous()
  @Get('statuses')
  @ApiOperation({ summary: 'Distinct project statuses, for filters' })
  @ApiOkResponse({ type: String, isArray: true })
  async getStatuses(@CurrentOrganizationId() organizationId: string): Promise<string[]> {
    return this.projectsService.getStatuses(organizationId);
  }

  // Keep after the static GET routes so ':id' doesn't capture them.
  @AllowAnonymous()
  @Get(':id')
  @ApiOperation({ summary: 'Project detail with ticket, timesheet and SLA summary' })
  @ApiOkResponse({ type: ProjectDetailDTO })
  async getProject(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentOrganizationId() organizationId: string,
  ): Promise<ProjectDetail> {
    return this.projectsService.getProjectDetail(id, organizationId);
  }

  @Patch(':id')
  @OrgRoles(['owner', 'admin'])
  @ApiOperation({ summary: 'Set or clear the display name, or reassign the client (org owner/admin)' })
  @ApiOkResponse({ type: ProjectResponseDTO })
  @ApiForbiddenResponse({ description: 'Caller is not an owner or admin of the active organization' })
  async updateProject(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateProjectDTO,
    @Session() session: UserSession,
  ): Promise<ProjectView> {
    return this.projectsService.updateProject(id, body, getActiveOrganizationId(session), session.user.id);
  }

  @AllowAnonymous()
  @Post('sync')
  @ApiOperation({ summary: 'Sync projects from Apptivo' })
  @ApiOkResponse({ type: ProjectSyncResultDTO, description: 'Project counts plus nested client counts. Nothing is deleted.' })
  async syncWorkOrders(@CurrentOrganizationId() organizationId: string): Promise<ProjectSyncResultDTO> {
    const counts = await this.projectsService.syncWorkOrdersFromApptivo(organizationId);
    return { message: 'Sync complete', ...counts };
  }
}
