import { Controller, Get, Query } from '@nestjs/common';
import { CurrentOrganizationId } from '../../../common/decorators/current-organization-id.decorator';
import { PaginatedResponse } from 'src/common/responses/paginated-api.response';
import { ProjectsService } from './projects.service';
import { GetAllProjectsQueryDTO } from './dto/get-all-projects-query.dto';
import { Project } from '@prisma/client';

@Controller('maintenance/projects')
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Get()
  async getAllProjects(
    @Query() query: GetAllProjectsQueryDTO,
    @CurrentOrganizationId() organizationId: string,
  ): Promise<PaginatedResponse<Project>> {
    return this.projectsService.getAllProjects(query, organizationId);
  }

  @Get('sync')
  async syncWorkOrders(
    @CurrentOrganizationId() organizationId: string,
  ): Promise<{ message: string; synced: number; deleted: number }> {
    const { synced, deleted } = await this.projectsService.syncWorkOrdersFromApptivo(organizationId);
    return { message: 'Sync complete', synced, deleted };
  }
}
