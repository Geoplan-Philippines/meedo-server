import { Module } from '@nestjs/common';
import { TeamsService } from './teams.service';
import { TeamsController } from './teams.controller';
import { PrismaService } from 'src/core/database/prisma.service';

@Module({
  controllers: [TeamsController],
  providers: [TeamsService, PrismaService],
  imports: [TeamsModule],
})
export class TeamsModule {}