import { Controller, Get, Req, UnauthorizedException } from '@nestjs/common';
import { ProjectsService } from './projects.service';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';

@Controller('projects')
export class ProjectsController {
  constructor(
      private readonly projectsService: ProjectsService,
  ) {}

  @AllowAnonymous()
  @Get('')
  getApptivoWorkOrders() {
      return this.projectsService.getApptivoWorkOrders();
  }

  @AllowAnonymous()
  @Get('sync')
  async getSync(@Req() req: any) {
    const apiKey = req.headers['x-api-key'];

    if (!apiKey || apiKey !== process.env.INTERNAL_API_KEY) {
      throw new UnauthorizedException();
    }

    const count = await this.projectsService.syncApptivoProjectsToDB();
    return { message: 'Sync complete', count };
  }
}
