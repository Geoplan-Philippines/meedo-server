import { Logger } from '@nestjs/common';
import { OnGatewayConnection, OnGatewayInit, WebSocketGateway } from '@nestjs/websockets';
import { DefaultEventsMap, Namespace, Socket } from 'socket.io';
import { fromNodeHeaders } from 'better-auth/node';
import { auth } from '../../core/auth/auth';
import { env } from '../../core/config/env.config';
import { NotificationEvents, notificationRoom } from './notification-events';
import { NotificationsService } from './notifications.service';

export type NotificationSocket = Socket<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, { userId?: string }>;
const allowedOrigins = env.CORS_ALLOWED_ORIGINS.filter(origin => origin !== '*');

@WebSocketGateway({ namespace: '/notifications', transports: ['websocket'], cors: { origin: allowedOrigins, credentials: true } })
export class NotificationsGateway implements OnGatewayInit, OnGatewayConnection {
  private readonly logger = new Logger(NotificationsGateway.name);
  constructor(private readonly notificationsService: NotificationsService, private readonly events: NotificationEvents) {}

  afterInit(server: Namespace<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, { userId?: string }>) {
    this.events.server = server;
    server.use((socket, next) => {
      void this.authenticate(socket).then(() => next(), () => next(new Error('Unauthorized')));
    });
  }

  async authenticate(socket: NotificationSocket) {
    const origin = socket.handshake.headers.origin;
    if (!origin || !allowedOrigins.includes(origin)) throw new Error('Origin not allowed');
    const session = await auth.api.getSession({ headers: fromNodeHeaders(socket.handshake.headers) });
    if (!session?.user?.id) throw new Error('Unauthorized');
    socket.data.userId = session.user.id;
  }

  async handleConnection(socket: NotificationSocket) {
    const userId = socket.data.userId;
    if (!userId) { socket.disconnect(true); return; }
    try {
      await socket.join(notificationRoom(userId));
      socket.emit('notification:unread-count', { count: await this.notificationsService.unreadCount(userId) });
    } catch { this.logger.warn('Notification socket initialization failed.'); socket.disconnect(true); }
  }
}
