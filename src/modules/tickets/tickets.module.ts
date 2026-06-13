import { Module } from '@nestjs/common';
import { TicketsService } from './services/tickets.service';
import { TicketsController } from './tickets.controller';
import { TicketCommentsController } from './ticket-comments.controller';
import { TicketCommentsService } from './services/ticket-comments.service';
import { TicketActivityService } from './services/ticket-activity.service';

@Module({
  controllers: [TicketsController, TicketCommentsController],
  providers: [TicketsService, TicketCommentsService, TicketActivityService],
})
export class TicketsModule {}
