import { Module } from '@nestjs/common';
import { TicketsService } from './tickets.service';
import { TicketsController } from './tickets.controller';
import { TicketCommentsController } from './comments/ticket-comments.controller';
import { TicketCommentsService } from './comments/ticket-comments.service';
import { TicketActivityService } from './activity/ticket-activity.service';
import { TicketAttachmentsController } from './attachments/ticket-attachments.controller';
import { CloudinaryModule } from '../../shared/cloudinary/cloudinary.module';

@Module({
  imports: [CloudinaryModule],
  controllers: [TicketsController, TicketCommentsController, TicketAttachmentsController],
  providers: [TicketsService, TicketCommentsService, TicketActivityService],
})
export class TicketsModule {}
