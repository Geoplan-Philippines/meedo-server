import { Module } from '@nestjs/common';
import { SubscribersService } from './subscribers.service';
import { SubscribersController } from './subscribers.controller';
import { PrismaService } from 'src/core/database/prisma.service';

@Module({
  controllers: [SubscribersController],
  providers: [SubscribersService, PrismaService],
})
export class SubscribersModule {}
