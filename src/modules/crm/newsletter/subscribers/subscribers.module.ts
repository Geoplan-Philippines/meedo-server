import { Module } from '@nestjs/common';

import { PublicUnsubscribeController } from '../../public/public-unsubscribe.controller';
import { SubscribersController } from './subscribers.controller';
import { SubscribersService } from './subscribers.service';

@Module({
  controllers: [SubscribersController, PublicUnsubscribeController],
  providers: [SubscribersService],
  exports: [SubscribersService],
})
export class SubscribersModule {}
