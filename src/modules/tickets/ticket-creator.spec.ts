import { ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { TicketDepartmentAccessService } from './access/ticket-department-access.service';
import { TicketActivityService } from './activity/ticket-activity.service';
import { TicketsService } from './tickets.service';

describe('employee-created tickets', () => {
  const row = { id: 'example-ticket', title: 'Example ticket', organizationId: 'example-org', createdById: 'example-member', projectId: null, teamId: null, ticketStatusId: null, resolvedAt: null, firstRespondedAt: null, dueDate: null, priority: 'MEDIUM', assignees: [], relatedTickets: [] };
  let current = { ...row };
  const db = { member: { findUnique: jest.fn(), count: jest.fn() }, teamMember: { findMany: jest.fn() }, project: { findFirst: jest.fn() }, tickets: { create: jest.fn(), findFirst: jest.fn(), update: jest.fn(), findUniqueOrThrow: jest.fn() }, ticketStatus: { findFirst: jest.fn() }, slaPolicy: { findMany: jest.fn() }, $transaction: jest.fn() };
  let service: TicketsService;
  beforeEach(() => {
    jest.resetAllMocks(); current = { ...row };
    db.member.findUnique.mockImplementation(({ where }: { where: { organizationId_userId: { userId: string } } }) => Promise.resolve({ id: where.organizationId_userId.userId + '-membership', role: where.organizationId_userId.userId === 'example-admin' ? 'admin' : 'member' }));
    db.teamMember.findMany.mockResolvedValue([]); db.member.count.mockResolvedValue(1);
    db.project.findFirst.mockImplementation(({ where }: { where: { id: string; members?: unknown } }) => Promise.resolve(where.members && where.id !== 'example-visible-project' ? null : { id: where.id, isArchived: false }));
    db.tickets.create.mockResolvedValue(row); db.tickets.findFirst.mockImplementation(() => Promise.resolve(current)); db.tickets.update.mockResolvedValue(row); db.tickets.findUniqueOrThrow.mockResolvedValue(row); db.ticketStatus.findFirst.mockResolvedValue({ id: 'example-completed-status', category: 'COMPLETED' }); db.slaPolicy.findMany.mockResolvedValue([]);
    db.$transaction.mockImplementation((run: (tx: unknown) => Promise<unknown>) => run(db));
    const prisma = db as unknown as PrismaService;
    service = new TicketsService(prisma, { record: jest.fn() } as unknown as TicketActivityService, new TicketDepartmentAccessService(prisma), { ticketEvent: jest.fn() } as unknown as NotificationsService);
  });
  it('allows a member to create in their project, records the creator and self-assignment, and starts first response', async () => {
    await service.createTicket({ title: 'Example member ticket', projectId: 'example-visible-project' }, row.organizationId, 'example-member');
    const call = (db.tickets.create.mock.calls as unknown[][])[0][0] as { data: { createdBy: { connect: { id: string } }; firstRespondedAt: Date; assignees: { createMany: { data: { memberId: string }[] } } } };
    expect(call.data.createdBy.connect.id).toBe('example-member'); expect(call.data.firstRespondedAt).toBeInstanceOf(Date); expect(call.data.assignees.createMany.data).toEqual([{ memberId: 'example-member-membership' }]);
  });
  it('allows a member to create without a project or a department', async () => {
    await expect(service.createTicket({ title: 'Example independent work' }, row.organizationId, 'example-member')).resolves.toBeDefined();
  });
  it('rejects creation in another project and assignment to another employee', async () => {
    await expect(service.createTicket({ title: 'Example denied project', projectId: 'example-hidden-project' }, row.organizationId, 'example-member')).rejects.toThrow(ForbiddenException);
    await expect(service.createTicket({ title: 'Example denied assignment', assigneeIds: ['example-other-membership'] }, row.organizationId, 'example-member')).rejects.toThrow(ForbiddenException);
    expect(db.tickets.create).not.toHaveBeenCalled();
  });
  it('lets a member edit and close their own ticket and denies editing another creator ticket', async () => {
    await expect(service.updateTicket(row.id, { title: 'Example own edit', ticketStatusId: 'example-completed-status' }, row.organizationId, 'example-member')).resolves.toBeDefined();
    expect(db.tickets.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ resolvedAt: expect.any(Date) as unknown }) as unknown }));
    current.createdById = 'example-other'; await expect(service.updateTicket(row.id, { title: 'Example denied edit' }, row.organizationId, 'example-member')).rejects.toThrow(ForbiddenException);
  });
  it('keeps admins able to edit tickets created by anyone', async () => {
    current.createdById = 'example-other'; await expect(service.updateTicket(row.id, { title: 'Example admin correction' }, row.organizationId, 'example-admin')).resolves.toBeDefined();
  });
});
