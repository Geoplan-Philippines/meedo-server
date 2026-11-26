import { Module } from '@nestjs/common';

import { IntegrationModule } from '../../integration/integration.module';
import { PublicUnsubscribeController } from '../../public/public-unsubscribe.controller';
import { SubscribersController } from './subscribers.controller';
import { SubscribersService } from './subscribers.service';

@Module({
  imports: [IntegrationModule],
  controllers: [SubscribersController, PublicUnsubscribeController],
  providers: [SubscribersService],
  exports: [SubscribersService],
})
export class SubscribersModule {}
