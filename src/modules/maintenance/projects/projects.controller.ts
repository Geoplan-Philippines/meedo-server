import { Controller, Get, Query } from '@nestjs/common';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';
import { GetAllProjectsQueryDTO } from './dto/get-all-projects-query.dto';
import { ProjectsService } from './projects.service';
import { PaginatedResponse } from 'src/common/responses/paginated-api.response';
import { Project } from '@prisma/client';

@Controller('maintenance/projects')
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @AllowAnonymous()
  @Get()
  getAllProjects(@Query() query: GetAllProjectsQueryDTO): Promise<PaginatedResponse<Project>> {
    return this.projectsService.getAllProjects(query);
  }

  @AllowAnonymous()
  @Get('sync')
  async syncWorkOrders() {
    const { synced, deleted } = await this.projectsService.syncWorkOrdersFromApptivo();
    return { message: 'Sync complete', synced, deleted };
  }
}
