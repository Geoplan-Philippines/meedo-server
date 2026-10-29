import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';
import { buildPaginationMeta } from '../../common/responses/paginated-api.response';
import { NotificationEvents } from './notification-events';
import { CreateNotification, NOTIFICATION_TYPES, NotificationType } from './notification.types';
import { ListNotificationsDTO } from './dto/list-notifications.dto';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  constructor(private readonly prisma: PrismaService, private readonly events: NotificationEvents) {}

  /** Call after the business transaction commits. This boundary never throws. */
  async create(input: CreateNotification) {
    try {
      if (input.recipientUserId === input.actorUserId) return null;
      if (!input.link.startsWith('/') || input.link.startsWith('//')) return null;
      const membership = await this.prisma.member.findUnique({ where: { organizationId_userId: { organizationId: input.organizationId, userId: input.recipientUserId } }, select: { id: true } });
      if (!membership) return null;
      const notification = await this.prisma.notification.create({ data: input });
      this.events.emit(input.recipientUserId, 'notification:new', notification);
      await this.publishCount(input.recipientUserId);
      return notification;
    } catch { this.logger.warn('Notification creation or delivery failed after the action committed.'); return null; }
  }

  async createMany(inputs: CreateNotification[]) {
    const unique = new Map(inputs.map(input => [`${input.recipientUserId}:${input.type}:${input.entityId}`, input]));
    return Promise.all([...unique.values()].map(input => this.create(input)));
  }

  private identity(userId: string) { if (!userId) throw new ForbiddenException('Authentication is required.'); }

  async list(userId: string, query: ListNotificationsDTO) {
    this.identity(userId);
    const where = { recipientUserId: userId, ...(query.unreadOnly ? { readAt: null } : {}) };
    const [data, total] = await Promise.all([
      this.prisma.notification.findMany({ where, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: (query.page - 1) * query.limit, take: query.limit }),
      this.prisma.notification.count({ where }),
    ]);
    return { data, meta: buildPaginationMeta(total, query.page, query.limit) };
  }

  async unreadCount(userId: string) {
    this.identity(userId);
    return this.prisma.notification.count({ where: { recipientUserId: userId, readAt: null } });
  }

  async publishCount(userId: string) {
    try { this.events.emit(userId, 'notification:unread-count', { count: await this.unreadCount(userId) }); }
    catch { this.logger.warn('Notification unread-count delivery failed.'); }
  }

  async read(userId: string, id: string) {
    this.identity(userId);
    const notification = await this.prisma.notification.findFirst({ where: { id, recipientUserId: userId } });
    if (!notification) throw new NotFoundException('Notification not found.');
    await this.prisma.notification.updateMany({ where: { id, recipientUserId: userId, readAt: null }, data: { readAt: new Date() } });
    // Both emissions go to every tab belonging to this user, after the write commits.
    this.events.emit(userId, 'notification:read', { id });
    await this.publishCount(userId);
    return { id };
  }

  async readAll(userId: string) {
    this.identity(userId);
    await this.prisma.notification.updateMany({ where: { recipientUserId: userId, readAt: null }, data: { readAt: new Date() } });
    this.events.emit(userId, 'notification:read-all', {});
    await this.publishCount(userId);
    return { count: await this.unreadCount(userId) };
  }

  /** Resolve recipients after commit; reporter is createdById, with the original CREATED activity as a legacy fallback. */
  async ticketEvent(ticketId: string, organizationId: string, actorUserId: string | undefined, type: NotificationType, newAssigneeIds?: string[]) {
    try {
      const ticket = await this.prisma.tickets.findFirst({ where: { id: ticketId, organizationId }, include: { assignees: { include: { member: true } } } });
      if (!ticket) return;
      const reporter = type === NOTIFICATION_TYPES.ticketAssigned ? null : ticket.createdById ? { actor: { userId: ticket.createdById } } : await this.prisma.ticketActivity.findFirst({ where: { ticketId, type: 'CREATED' }, orderBy: { createdAt: 'asc' }, select: { actor: { select: { userId: true } } } });
      const recipients = type === NOTIFICATION_TYPES.ticketAssigned
        ? ticket.assignees.filter(row => newAssigneeIds?.includes(row.memberId)).map(row => row.member.userId)
        : [...ticket.assignees.map(row => row.member.userId), ...(reporter?.actor?.userId ? [reporter.actor.userId] : [])];
      const title = type === NOTIFICATION_TYPES.ticketAssigned ? 'Ticket assigned to you' : type === NOTIFICATION_TYPES.ticketComment ? 'New ticket comment' : 'Ticket status changed';
      await this.createMany(recipients.map(recipientUserId => ({ organizationId, recipientUserId, actorUserId, type, title, body: ticket.title, link: `/tickets/${ticketId}`, entityType: 'ticket', entityId: ticketId })));
    } catch { this.logger.warn('Ticket notification failed after the action committed.'); }
  }
}
