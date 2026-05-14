import { Module } from '@nestjs/common';
import { ApptivoTicketsController } from './tickets.controller';
import { ApptivoTicketsService } from './tickets.service';
import { PrismaService } from '../../../core/database/prisma.service';

@Module({
  
  controllers: [ApptivoTicketsController],
  providers: [ApptivoTicketsService, PrismaService],
})
export class ApptivoTicketsModule {}