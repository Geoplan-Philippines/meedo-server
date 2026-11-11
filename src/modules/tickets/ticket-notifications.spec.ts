import { PrismaService } from '../../core/database/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { TicketDepartmentAccessService } from './access/ticket-department-access.service';
import { TicketActivityService } from './activity/ticket-activity.service';
import { TicketCommentsService } from './comments/ticket-comments.service';
import { TicketsService } from './tickets.service';

describe('Ticket notifications after commit', () => {
  const ticket = { id: 'example-ticket', title: 'Example ticket', priority: 'MEDIUM', ticketStatusId: 'example-old-status', projectId: null, teamId: null, resolvedAt: null, firstRespondedAt: null, dueDate: null, assignees: [{ memberId: 'example-old-member' }], relatedTickets: [] };
  const prisma = {
    tickets: { create: jest.fn(), findFirst: jest.fn(), update: jest.fn(), findUniqueOrThrow: jest.fn() },
    member: { count: jest.fn() }, ticketStatus: { findFirst: jest.fn() },
    ticketAssignee: { createMany: jest.fn(), deleteMany: jest.fn() },
    ticketComment: { create: jest.fn() }, slaPolicy: { findMany: jest.fn() }, $transaction: jest.fn(),
  };
  const scope = { organizationId: 'example-org', userId: 'example-actor', memberId: 'example-member', isAdmin: true };
  const access = { resolve: jest.fn(), assertTeam: jest.fn(), assertTicket: jest.fn(), where: jest.fn(), detailInclude: jest.fn() };
  const activity = { record: jest.fn() }; const notifications = { ticketEvent: jest.fn() };
  let service: TicketsService; let comments: TicketCommentsService; let transactionOpen: boolean;
  beforeEach(() => {
    jest.resetAllMocks(); transactionOpen = false;
    prisma.$transaction.mockImplementation(async (run: (tx: unknown) => Promise<unknown>) => { transactionOpen = true; try { return await run(prisma); } finally { transactionOpen = false; } });
    prisma.tickets.create.mockResolvedValue(ticket); prisma.tickets.findFirst.mockResolvedValue(ticket); prisma.tickets.update.mockResolvedValue(ticket); prisma.tickets.findUniqueOrThrow.mockResolvedValue(ticket);
    prisma.member.count.mockImplementation(({ where }: { where: { id: { in: string[] } } }) => Promise.resolve(where.id.in.length)); prisma.ticketStatus.findFirst.mockResolvedValue({ id: 'example-new-status', category: 'STARTED' }); prisma.slaPolicy.findMany.mockResolvedValue([]);
    prisma.ticketComment.create.mockResolvedValue({ id: 'example-comment', body: 'Invented comment' });
    access.resolve.mockResolvedValue(scope); access.where.mockImplementation((_scope: unknown, filter: object = {}) => ({ organizationId: scope.organizationId, ...filter })); access.detailInclude.mockReturnValue({});
    notifications.ticketEvent.mockImplementation(() => { expect(transactionOpen).toBe(false); return Promise.resolve(); });
    service = new TicketsService(prisma as unknown as PrismaService, activity as unknown as TicketActivityService, access as unknown as TicketDepartmentAccessService, notifications as unknown as NotificationsService);
    comments = new TicketCommentsService(prisma as unknown as PrismaService, activity as unknown as TicketActivityService, access as unknown as TicketDepartmentAccessService, notifications as unknown as NotificationsService);
  });
  it('notifies new assignees after ticket creation commits', async () => {
    await service.createTicket({ title: 'Example ticket', assigneeIds: ['example-new-member'] }, scope.organizationId, scope.userId);
    expect(notifications.ticketEvent).toHaveBeenCalledWith(ticket.id, scope.organizationId, scope.userId, 'ticket_assigned', ['example-new-member']);
  });
  it('notifies only added assignees and a changed status after update commits', async () => {
    await service.updateTicket(ticket.id, { assigneeIds: ['example-old-member', 'example-new-member'], ticketStatusId: 'example-new-status' }, scope.organizationId, scope.userId);
    expect(notifications.ticketEvent).toHaveBeenCalledWith(ticket.id, scope.organizationId, scope.userId, 'ticket_assigned', ['example-new-member']);
    expect(notifications.ticketEvent).toHaveBeenCalledWith(ticket.id, scope.organizationId, scope.userId, 'ticket_status_changed');
  });
  it('does not notify unchanged assignments or status', async () => {
    await service.updateTicket(ticket.id, { assigneeIds: ['example-old-member'], ticketStatusId: ticket.ticketStatusId }, scope.organizationId, scope.userId);
    expect(notifications.ticketEvent).not.toHaveBeenCalled();
  });
  it('notifies after a comment commits', async () => {
    await comments.addComment(ticket.id, scope.organizationId, scope.userId, { body: 'Invented comment' });
    expect(notifications.ticketEvent).toHaveBeenCalledWith(ticket.id, scope.organizationId, scope.userId, 'ticket_comment');
  });
  it('keeps successful actions successful when notification creation or emit fails', async () => {
    notifications.ticketEvent.mockRejectedValue(new Error('Invented delivery failure'));
    await expect(service.createTicket({ title: 'Example ticket' }, scope.organizationId, scope.userId)).resolves.toBeDefined();
    await expect(service.updateTicket(ticket.id, { ticketStatusId: 'example-new-status' }, scope.organizationId, scope.userId)).resolves.toBeDefined();
    await expect(comments.addComment(ticket.id, scope.organizationId, scope.userId, { body: 'Invented comment' })).resolves.toBeDefined();
  });
  it('never notifies when the business transaction rolls back', async () => {
    prisma.tickets.update.mockRejectedValue(new Error('Invented transaction failure'));
    await expect(service.updateTicket(ticket.id, { ticketStatusId: 'example-new-status' }, scope.organizationId, scope.userId)).rejects.toThrow('Invented transaction failure');
    expect(notifications.ticketEvent).not.toHaveBeenCalled();
  });
});
