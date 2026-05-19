import { Module } from '@nestjs/common';
import { TeamsService } from './teams.service';
import { TeamsController } from './teams.controller';

@Module({
  controllers: [TeamsController],
  providers: [TeamsService],
  imports: [TeamsModule],
})
export class TeamsModule {}