import { Module } from '@nestjs/common';
import { TicketCategoriesService } from './ticket-categories.service';
import { TicketCategoriesController } from './ticket-categories.controller';
import { PrismaService } from '../../../core/database/prisma.service';

@Module({
  controllers: [TicketCategoriesController],
  providers: [TicketCategoriesService, PrismaService],
})
export class TicketCategoriesModule {}
