import { Module } from '@nestjs/common';
import { NewsletterService } from './newsletter.service';
import { NewsletterController } from './newsletter.controller';
import { SubscribersModule } from './subscribers/subscribers.module';

@Module({
  controllers: [NewsletterController],
  providers: [NewsletterService],
  imports: [SubscribersModule],
})
export class NewsletterModule {}
