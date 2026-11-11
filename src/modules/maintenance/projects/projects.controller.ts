import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { CreateProjectDTO } from './dto/create-project.dto';
import { AddProjectMemberDTO, ArchiveProjectDTO, CloseProjectDTO } from './dto/project-state.dto';
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
    @CurrentUser('id') userId: string,
  ): Promise<PaginatedResponse<ProjectView>> {
    return this.projectsService.getAllProjects(query, organizationId, userId);
  }

  @AllowAnonymous()
  @Get('statuses')
  @ApiOperation({ summary: 'Distinct project statuses, for filters' })
  @ApiOkResponse({ type: String, isArray: true })
  async getStatuses(@CurrentOrganizationId() organizationId: string, @CurrentUser('id') userId: string): Promise<string[]> {
    return this.projectsService.getStatuses(organizationId, userId);
  }

  @Post()
  @OrgRoles(['owner', 'admin'])
  @ApiOperation({ summary: 'Create an internal project with a client' })
  create(@Body() dto: CreateProjectDTO, @CurrentOrganizationId() org: string, @CurrentUser('id') user: string) { return this.projectsService.createProject(dto, org, user); }

  @Get('member-options')
  @OrgRoles(['owner', 'admin'])
  @ApiOperation({ summary: 'Organization members available to add to a project' })
  memberOptions(@CurrentOrganizationId() org: string, @CurrentUser('id') user: string) { return this.projectsService.memberOptions(org, user); }

  @Get(':id/members')
  @ApiOperation({ summary: 'Members of a visible project' })
  members(@Param('id', ParseUUIDPipe) id: string, @CurrentOrganizationId() org: string, @CurrentUser('id') user: string) { return this.projectsService.listMembers(id, org, user); }

  @Post(':id/members')
  @OrgRoles(['owner', 'admin'])
  @ApiOperation({ summary: 'Add an organization member to a project' })
  addMember(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AddProjectMemberDTO, @CurrentOrganizationId() org: string, @CurrentUser('id') user: string) { return this.projectsService.changeMember(id, dto.userId, true, org, user); }

  @Delete(':id/members/:userId')
  @OrgRoles(['owner', 'admin'])
  @ApiOperation({ summary: 'Remove a project membership' })
  removeMember(@Param('id', ParseUUIDPipe) id: string, @Param('userId', ParseUUIDPipe) memberUser: string, @CurrentOrganizationId() org: string, @CurrentUser('id') user: string) { return this.projectsService.changeMember(id, memberUser, false, org, user); }

  @Patch(':id/closed')
  @OrgRoles(['owner', 'admin'])
  @ApiOperation({ summary: 'Set the informational Closed tag; support remains available' })
  close(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CloseProjectDTO, @CurrentOrganizationId() org: string, @CurrentUser('id') user: string) { return this.projectsService.setState(id, dto, org, user); }

  @Patch(':id/archive')
  @OrgRoles(['owner', 'admin'])
  @ApiOperation({ summary: 'Manually archive or restore a project; manual archives survive sync' })
  archive(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ArchiveProjectDTO, @CurrentOrganizationId() org: string, @CurrentUser('id') user: string) { return this.projectsService.setState(id, dto, org, user); }

  // Keep after the static GET routes so ':id' doesn't capture them.
  @AllowAnonymous()
  @Get(':id')
  @ApiOperation({ summary: 'Project detail with ticket, timesheet and SLA summary' })
  @ApiOkResponse({ type: ProjectDetailDTO })
  async getProject(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentOrganizationId() organizationId: string,
    @CurrentUser('id') userId: string,
  ): Promise<ProjectDetail> {
    return this.projectsService.getProjectDetail(id, organizationId, userId);
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
