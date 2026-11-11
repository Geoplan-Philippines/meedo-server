jest.mock('../../core/auth/auth', () => ({ auth: { api: { getSession: jest.fn() } } }));
jest.mock('better-auth/node', () => ({ fromNodeHeaders: (headers: Record<string, string>) => new Headers(headers) }));

import { Namespace } from 'socket.io';
import { auth } from '../../core/auth/auth';
import { env } from '../../core/config/env.config';
import { NotificationEvents, notificationRoom } from './notification-events';
import { NotificationsGateway, NotificationSocket } from './notifications.gateway';
import { NotificationsService } from './notifications.service';

describe('NotificationsGateway authentication and private user rooms', () => {
  const sessions = jest.mocked(auth.api.getSession);
  const exampleUser = (id: string) => ({ id, name: 'Example User', email: `${id}@example.test`, emailVerified: true, image: null, createdAt: new Date(), updatedAt: new Date() });
  const exampleSession = (id: string) => ({ user: exampleUser(id), session: { id: `session-${id}`, userId: id, token: `token-${id}`, createdAt: new Date(), updatedAt: new Date(), expiresAt: new Date(Date.now() + 60_000) } });
  const service = { unreadCount: jest.fn().mockResolvedValue(1) };
  let events: NotificationEvents; let gateway: NotificationsGateway;
  const sockets = new Map<string, { emit: jest.Mock; room?: string }>();
  const socket = (id: string, origin = env.CORS_ALLOWED_ORIGINS[0]) => {
    const client = { data: {} as Record<string, unknown>, handshake: { headers: { origin, cookie: id } }, emit: jest.fn(), disconnect: jest.fn(), join: jest.fn((room: string) => { sockets.set(id, { emit: client.emit, room }); return Promise.resolve(); }) };
    return client;
  };
  beforeEach(() => {
    sessions.mockReset(); sockets.clear(); events = new NotificationEvents();
    gateway = new NotificationsGateway(service as unknown as NotificationsService, events);
    gateway.afterInit({ use: jest.fn(), to: (room: string) => ({ emit: (event: string, payload: unknown) => { for (const client of sockets.values()) if (client.room === room) client.emit(event, payload); } }) } as unknown as Parameters<NotificationsGateway['afterInit']>[0]);
  });
  it('rejects unauthenticated connections and disallowed origins', async () => {
    sessions.mockResolvedValue(null);
    await expect(gateway.authenticate(socket('none') as unknown as NotificationSocket)).rejects.toThrow('Unauthorized');
    await expect(gateway.authenticate(socket('none', 'https://example.test') as unknown as NotificationSocket)).rejects.toThrow('Origin not allowed');
    const client = socket('none'); await gateway.handleConnection(client as unknown as NotificationSocket); expect(client.disconnect).toHaveBeenCalledWith(true); expect(client.join).not.toHaveBeenCalled();
  });
  it('uses the cookie session identity, ignores requested rooms, and sends the initial count', async () => {
    sessions.mockResolvedValue(exampleSession('example-a')); const client = socket('a');
    client.data.room = 'user:example-b'; await gateway.authenticate(client as unknown as NotificationSocket); await gateway.handleConnection(client as unknown as NotificationSocket);
    expect(client.join).toHaveBeenCalledWith(notificationRoom('example-a'));
    expect(client.emit).toHaveBeenCalledWith('notification:unread-count', { count: 1 });
  });
  it('delivers a new item and mark-read/count events to both user tabs, never another user', async () => {
    const a1 = socket('a1'), a2 = socket('a2'), b = socket('b');
    for (const [client, userId] of [[a1, 'example-a'], [a2, 'example-a'], [b, 'example-b']] as const) {
      sessions.mockResolvedValue(exampleSession(userId)); await gateway.authenticate(client as unknown as NotificationSocket); await gateway.handleConnection(client as unknown as NotificationSocket); client.emit.mockClear();
    }
    for (const event of ['notification:new', 'notification:read', 'notification:unread-count']) events.emit('example-a', event, { id: 'example-notification', count: 0 });
    expect(a1.emit).toHaveBeenCalledTimes(3); expect(a2.emit).toHaveBeenCalledTimes(3); expect(b.emit).not.toHaveBeenCalled();
  });
  it('contains socket delivery failures at the broker boundary', () => {
    events.server = { to: () => { throw new Error('Invented emit failure'); } } as unknown as Namespace;
    expect(() => events.emit('example-a', 'notification:new', {})).not.toThrow();
  });
});
