import { Module } from '@nestjs/common';
import { SubscribersModule } from './subscribers/subscribers.module';

@Module({
  imports: [SubscribersModule]
})
export class NewsletterModule {}
