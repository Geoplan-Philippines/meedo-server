import { Controller, Get, Req, UnauthorizedException } from '@nestjs/common';
import { ProjectsService } from './projects.service';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';
import type { Request } from 'express';
@Controller('projects')
export class ProjectsController {
  constructor(
      private readonly projectsService: ProjectsService,
  ) {}

  // endpoint is temp public for testing
  @AllowAnonymous()
  @Get('')
  getApptivoWorkOrders() {
      return this.projectsService.getApptivoWorkOrders();
  }

  @AllowAnonymous()
  @Get('sync')
  async getSync(@Req() req: Request) {
    const apiKey = req.headers['x-api-key'] as string;

    if (!apiKey || apiKey !== process.env.INTERNAL_API_KEY) {
      throw new UnauthorizedException();
    }

    const count = await this.projectsService.syncApptivoProjectsToDB();
    return { message: 'Sync complete', count };
  }
}
