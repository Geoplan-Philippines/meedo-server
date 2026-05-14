import { Module } from '@nestjs/common';
import { TicketCategoriesService } from './ticket-categories.service';
import { TicketCategoriesController } from './ticket-categories.controller';

@Module({
  controllers: [TicketCategoriesController],
  providers: [TicketCategoriesService],
})
export class TicketCategoriesModule {}
