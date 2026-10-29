import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';
import { NotificationEvents } from './notification-events';
import { NotificationsService } from './notifications.service';
import { NOTIFICATION_TYPES } from './notification.types';
import { ListNotificationsDTO } from './dto/list-notifications.dto';

describe('NotificationsService recipient isolation and best-effort delivery', () => {
  const input = { organizationId: 'example-org', recipientUserId: 'example-recipient', actorUserId: 'example-actor', type: NOTIFICATION_TYPES.projectMemberAdded, title: 'Example project', body: 'Example body', link: '/notifications', entityType: 'project', entityId: 'example-project' };
  const row = { ...input, id: 'example-notification', readAt: null, createdAt: new Date() };
  const prisma = {
    member: { findUnique: jest.fn() },
    notification: { create: jest.fn(), findFirst: jest.fn(), findMany: jest.fn(), count: jest.fn(), updateMany: jest.fn() },
    tickets: { findFirst: jest.fn() }, ticketActivity: { findFirst: jest.fn() },
  };
  const events = { emit: jest.fn() };
  let service: NotificationsService;
  beforeEach(() => {
    jest.resetAllMocks(); prisma.member.findUnique.mockResolvedValue({ id: 'example-member' });
    prisma.notification.create.mockResolvedValue(row); prisma.notification.count.mockResolvedValue(3);
    prisma.notification.findFirst.mockResolvedValue(row); prisma.notification.findMany.mockResolvedValue([row]);
    prisma.notification.updateMany.mockResolvedValue({ count: 1 });
    service = new NotificationsService(prisma as unknown as PrismaService, events as unknown as NotificationEvents);
  });
  it('saves first, then emits to only the recipient and publishes their count', async () => {
    await service.create(input);
    expect(events.emit.mock.invocationCallOrder[0]).toBeGreaterThan(prisma.notification.create.mock.invocationCallOrder[0]);
    expect(events.emit).toHaveBeenCalledWith(input.recipientUserId, 'notification:new', row);
    expect(events.emit).toHaveBeenCalledWith(input.recipientUserId, 'notification:unread-count', { count: 3 });
  });
  it('skips self-notifications, duplicate recipients, and invalid links', async () => {
    await service.create({ ...input, recipientUserId: input.actorUserId });
    await service.create({ ...input, link: '//example.test' });
    expect(prisma.notification.create).not.toHaveBeenCalled();
    await service.createMany([input, input]); expect(prisma.notification.create).toHaveBeenCalledTimes(1);
  });
  it('skips recipients outside the notification organization', async () => {
    prisma.member.findUnique.mockResolvedValue(null); await service.create(input);
    expect(prisma.notification.create).not.toHaveBeenCalled();
  });
  it('does not throw on a failed insert or failed socket emit', async () => {
    prisma.notification.create.mockRejectedValueOnce(new Error('Invented database failure'));
    await expect(service.create(input)).resolves.toBeNull();
    events.emit.mockImplementation(() => { throw new Error('Invented socket failure'); });
    await expect(service.create(input)).resolves.toBeNull();
  });
  it('scopes list, unread filter, pagination and counts to the logged-in recipient', async () => {
    await service.list(input.recipientUserId, Object.assign(new ListNotificationsDTO(), { page: 2, limit: 5, unreadOnly: true }));
    expect(prisma.notification.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { recipientUserId: input.recipientUserId, readAt: null }, skip: 5, take: 5 }));
    await expect(service.unreadCount('')).rejects.toThrow(ForbiddenException);
  });
  it('cannot read another user notification', async () => {
    prisma.notification.findFirst.mockResolvedValue(null);
    await expect(service.read('example-other', row.id)).rejects.toThrow(NotFoundException);
    expect(prisma.notification.findFirst).toHaveBeenCalledWith({ where: { id: row.id, recipientUserId: 'example-other' } });
    expect(prisma.notification.updateMany).not.toHaveBeenCalled();
  });
  it('mark-read and read-all publish row changes and unread counts for other tabs after writes', async () => {
    await service.read(input.recipientUserId, row.id); await service.readAll(input.recipientUserId);
    expect(events.emit).toHaveBeenCalledWith(input.recipientUserId, 'notification:read', { id: row.id });
    expect(events.emit).toHaveBeenCalledWith(input.recipientUserId, 'notification:read-all', {});
    expect(events.emit).toHaveBeenCalledWith(input.recipientUserId, 'notification:unread-count', { count: 3 });
    expect(prisma.notification.updateMany).toHaveBeenLastCalledWith({ where: { recipientUserId: input.recipientUserId, readAt: null }, data: { readAt: expect.any(Date) as unknown } });
  });
  it('uses the explicit ticket creator before the legacy activity reporter', async () => {
    prisma.tickets.findFirst.mockResolvedValue({ id: 'example-ticket', title: 'Example title', createdById: 'example-creator', assignees: [] });
    await service.ticketEvent('example-ticket', input.organizationId, input.actorUserId, NOTIFICATION_TYPES.ticketComment);
    expect(prisma.ticketActivity.findFirst).not.toHaveBeenCalled();
    expect(prisma.notification.create).toHaveBeenCalledWith({ data: expect.objectContaining({ recipientUserId: 'example-creator' }) as unknown });
  });
  it.each([NOTIFICATION_TYPES.ticketAssigned, NOTIFICATION_TYPES.ticketStatusChanged, NOTIFICATION_TYPES.ticketComment])('resolves recipients and skips the actor for %s', async type => {
    prisma.tickets.findFirst.mockResolvedValue({ id: 'example-ticket', title: 'Example ticket', assignees: [{ memberId: 'new-member', member: { userId: 'example-recipient' } }, { memberId: 'actor-member', member: { userId: 'example-actor' } }] });
    prisma.ticketActivity.findFirst.mockResolvedValue({ actor: { userId: 'example-reporter' } });
    await service.ticketEvent('example-ticket', input.organizationId, input.actorUserId, type, ['new-member']);
    const calls = prisma.notification.create.mock.calls as { data: { recipientUserId: string; type: string } }[][];
    expect(calls.map(call => call[0].data.recipientUserId).sort()).toEqual(type === NOTIFICATION_TYPES.ticketAssigned ? ['example-recipient'] : ['example-recipient', 'example-reporter']);
  });
});
