import { Module } from '@nestjs/common';
import { TicketsService } from './tickets.service';
import { TicketsController } from './tickets.controller';
import { TicketCommentsController } from './comments/ticket-comments.controller';
import { TicketCommentsService } from './comments/ticket-comments.service';
import { TicketActivityService } from './activity/ticket-activity.service';

@Module({
  controllers: [TicketsController, TicketCommentsController],
  providers: [TicketsService, TicketCommentsService, TicketActivityService],
})
export class TicketsModule {}
