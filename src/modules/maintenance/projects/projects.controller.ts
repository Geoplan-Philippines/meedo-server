import { Controller, Get } from '@nestjs/common';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';
import { ProjectsService } from './projects.service';

@Controller('maintenance/projects')
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @AllowAnonymous()
  @Get()
  getAllProjects() {
    return this.projectsService.getAllProjects();
  }

  @AllowAnonymous()
  @Get('sync')
  async syncWorkOrders() {
    const { synced, deleted } = await this.projectsService.syncWorkOrdersFromApptivo();
    return { message: 'Sync complete', synced, deleted };
  }
}
