import { Injectable, Logger } from '@nestjs/common';
import { Namespace } from 'socket.io';

export const notificationRoom = (userId: string) => `user:${userId}`;

@Injectable()
export class NotificationEvents {
  server?: Namespace;
  private readonly logger = new Logger(NotificationEvents.name);
  emit(userId: string, event: string, payload: unknown): void {
    try { this.server?.to(notificationRoom(userId)).emit(event, payload); }
    catch { this.logger.warn('Notification socket emit failed.'); }
  }
}
