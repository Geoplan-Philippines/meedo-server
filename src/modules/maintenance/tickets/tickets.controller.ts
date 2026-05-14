import { Controller, Get, UnauthorizedException, Headers, Req } from '@nestjs/common';
import { ApptivoTicketsService } from './tickets.service';



@Controller('maintenance/apptivo-tickets')
    export class ApptivoTicketsController {
    constructor(
        private readonly apptivoTicketsService: ApptivoTicketsService,
    ) {}

    @Get('work-orders')
    getApptivoWorkOrders() {
        return this.apptivoTicketsService.getApptivoWorkOrders();
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

    const count = await this.apptivoTicketsService.syncApptivoTicketsToDB();
    return { message: 'Sync complete', count };
  }

}