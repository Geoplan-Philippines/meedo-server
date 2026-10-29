import { Global, Module } from '@nestjs/common';
import { NotificationEvents } from './notification-events';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { NotificationsGateway } from './notifications.gateway';

@Global()
@Module({
  controllers: [NotificationsController],
  providers: [NotificationsGateway, NotificationsService, NotificationEvents],
  exports: [NotificationsService],
})
export class NotificationsModule {}
