import { Controller, Get, UnauthorizedException, Headers } from '@nestjs/common';
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
    async getSync(@Headers('x-api-key') apiKey: string) {
    if (apiKey !== process.env.INTERNAL_API_KEY) {
        throw new UnauthorizedException();
    }

    const count = await this.apptivoTicketsService.syncApptivoTicketsToDB();

    return {
        message: 'Sync complete',
        count,
    };
    }
}