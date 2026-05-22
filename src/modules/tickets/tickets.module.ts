import { Module } from '@nestjs/common';
import { TicketsService } from './tickets.service';
import { TicketsController } from './tickets.controller';
import { TeamsModule } from './teams/teams.module';

@Module({
  controllers: [TicketsController],
  providers: [TicketsService],
  imports: [TeamsModule],
})
export class TicketsModule {}
