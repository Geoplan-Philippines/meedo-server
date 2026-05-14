import { Controller, Get, Req, UnauthorizedException } from '@nestjs/common';
import { ProjectsService } from './projects.service';

@Controller('projects')
export class ProjectsController {
  constructor(
      private readonly projectsService: ProjectsService,
  ) {}

  @Get('work-orders')
  getApptivoWorkOrders() {
      return this.projectsService.getApptivoWorkOrders();
  }

  @Get('sync')
  async getSync(@Req() req: any) {
    const apiKey = req.headers['x-api-key']?.toString().trim();
    
    console.log('=== API KEY DEBUG ===');
    console.log('Received:', `"${apiKey}"`);
    console.log('Expected:', `"${process.env.INTERNAL_API_KEY}"`);
    console.log('Lengths:', apiKey?.length, process.env.INTERNAL_API_KEY?.length);
    console.log('Match:', apiKey === process.env.INTERNAL_API_KEY);
    console.log('====================');

    if (apiKey !== process.env.INTERNAL_API_KEY) {
      throw new UnauthorizedException();
    }

    const count = await this.projectsService.syncApptivoTicketsToDB();
    return { message: 'Sync complete', count };
  }
}
