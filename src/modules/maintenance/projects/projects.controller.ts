import { Controller, Get, Query } from '@nestjs/common';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';
import { ProjectsService } from './projects.service';

@Controller('maintenance/projects')
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @AllowAnonymous()
  @Get()
  getAllProjects(
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '10',
  ) {
    const pageNumber = Math.max(1, Number(page));
    const limitNumber = Math.min(50, Number(limit));
    return this.projectsService.getAllProjects(pageNumber, limitNumber);
  }

  @AllowAnonymous()
  @Get('sync')
  async syncWorkOrders() {
    const { synced, deleted } = await this.projectsService.syncWorkOrdersFromApptivo();
    return { message: 'Sync complete', synced, deleted };
  }
}
