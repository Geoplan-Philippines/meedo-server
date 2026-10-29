import { ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../../core/database/prisma.service';
import { NotificationEvents } from '../../notifications/notification-events';
import { NotificationsService } from '../../notifications/notifications.service';
import { NOTIFICATION_TYPES } from '../../notifications/notification.types';
import { TimesheetService } from './timesheet.service';
import { assertNotFutureWorkDate, manilaToday } from './timesheet-date';

const roles: Record<string, string> = { 'example-member': 'member', 'example-admin': 'admin', 'example-owner': 'owner' };
const baseEntry = { id: 'example-entry', organizationId: 'example-org', userId: 'example-member', projectId: null, ticketId: null, description: 'Example work', task: 'Example work', workDate: new Date('2026-10-24T00:00:00Z'), hours: 2, workType: 'REGULAR', location: 'OFC - DW', isOvertime: false, isNightDifferential: false, status: 'DRAFT', user: { id: 'example-member', name: 'Example Member', email: 'member@example.test', teamMembers: [] } };

describe('Manila calendar dates', () => {
  it.each([
    ['2026-10-27T15:59:59Z', '2026-10-27', false],
    ['2026-10-27T16:00:00Z', '2026-10-28', true],
    ['2026-10-27T23:59:59Z', '2026-10-28', true],
    ['2026-10-28T00:00:00Z', '2026-10-28', true],
  ])('uses Asia/Manila at %s', (instant, today, allowed) => {
    const now = new Date(instant); expect(manilaToday(now)).toBe(today);
    const check = () => assertNotFutureWorkDate(new Date('2026-10-28T00:00:00Z'), now);
    if (allowed) expect(check).not.toThrow(); else expect(check).toThrow('future');
  });
});

describe('Timesheet Phase 2 entries, approval and notifications', () => {
  let stored: typeof baseEntry; let transactionOpen: boolean;
  const savedNotifications: { recipientUserId: string; actorUserId: string; type: string; body: string; link: string }[] = [];
  const events = { emit: jest.fn() };
  const db = {
    member: { findUnique: jest.fn(), findMany: jest.fn() }, project: { findFirst: jest.fn() }, tickets: { findFirst: jest.fn(), findMany: jest.fn(), count: jest.fn() },
    notification: { create: jest.fn(), count: jest.fn() },
    timesheetEntry: { create: jest.fn(), update: jest.fn(), findFirst: jest.fn(), findMany: jest.fn(), updateMany: jest.fn(), aggregate: jest.fn() },
    timesheetPeriodLock: { findFirst: jest.fn(), findUnique: jest.fn() },
    timesheetAuditLog: { create: jest.fn(), createMany: jest.fn() }, $queryRaw: jest.fn(), $transaction: jest.fn(),
  };
  let service: TimesheetService; let notifications: NotificationsService;
  beforeEach(() => {
    jest.resetAllMocks(); jest.useFakeTimers().setSystemTime(new Date('2026-10-28T04:00:00Z')); transactionOpen = false; stored = { ...baseEntry }; savedNotifications.length = 0;
    db.member.findUnique.mockImplementation(({ where }: { where: { organizationId_userId: { userId: string } } }) => Promise.resolve({ id: where.organizationId_userId.userId + '-membership', role: roles[where.organizationId_userId.userId] ?? 'member' }));
    db.member.findMany.mockResolvedValue(Object.entries(roles).map(([userId, role]) => ({ userId, role })));
    db.project.findFirst.mockResolvedValue({ id: 'example-project', isArchived: false });
    db.timesheetEntry.findFirst.mockImplementation(({ where }: { where: { userId?: string } }) => Promise.resolve(!where.userId || where.userId === stored.userId ? stored : null));
    db.timesheetEntry.findMany.mockImplementation(() => Promise.resolve([stored]));
    db.timesheetEntry.create.mockImplementation(({ data }: { data: Partial<typeof baseEntry> }) => Promise.resolve({ ...baseEntry, ...data }));
    db.timesheetEntry.update.mockImplementation(({ data }: { data: Partial<typeof baseEntry> }) => { stored = { ...stored, ...data }; return Promise.resolve(stored); });
    db.timesheetEntry.updateMany.mockImplementation(({ data }: { data: Partial<typeof baseEntry> }) => { stored = { ...stored, ...data }; return Promise.resolve({ count: 1 }); });
    db.timesheetEntry.aggregate.mockResolvedValue({ _sum: { hours: 0 } }); db.timesheetPeriodLock.findFirst.mockResolvedValue(null); db.timesheetPeriodLock.findUnique.mockResolvedValue(null);
    db.$transaction.mockImplementation(async (run: (tx: unknown) => Promise<unknown>) => { transactionOpen = true; try { return await run(db); } finally { transactionOpen = false; } });
    db.notification.create.mockImplementation(({ data }: { data: typeof savedNotifications[number] }) => { expect(transactionOpen).toBe(false); savedNotifications.push(data); return Promise.resolve({ id: 'example-notification', ...data }); }); db.notification.count.mockResolvedValue(1);
    notifications = new NotificationsService(db as unknown as PrismaService, events as unknown as NotificationEvents);
    service = new TimesheetService(db as unknown as PrismaService, notifications);
  });
  afterEach(() => jest.useRealTimers());
  it.each(['2026-10-24', '2026-10-25'])('accepts weekend work on %s with no project', async workDate => {
    const entry = await service.createEntry('example-org', 'example-member', { workDate, hours: 2, description: '  Carrying example materials  ' });
    expect(entry).toMatchObject({ projectId: null, ticketId: null, description: 'Carrying example materials', task: 'Carrying example materials' });
  });
  it.each(['2026-10-27T15:59:59Z', '2026-10-27T16:00:00Z'])('enforces future-date rules for both create and update around Manila midnight at %s', async instant => {
    jest.setSystemTime(new Date(instant)); const create = service.createEntry('example-org', 'example-member', { workDate: '2026-10-28', hours: 1, description: 'Example work' });
    const update = service.updateEntry(stored.id, 'example-org', 'example-member', { workDate: '2026-10-28' });
    if (instant.includes('15:59')) { await expect(create).rejects.toThrow('future'); await expect(update).rejects.toThrow('future'); expect(db.timesheetEntry.create).not.toHaveBeenCalled(); expect(db.timesheetEntry.update).not.toHaveBeenCalled(); }
    else { await expect(create).resolves.toBeDefined(); await expect(update).resolves.toBeDefined(); }
  });
  it('derives project and description from the eligible ticket on create and update, preserving a title snapshot', async () => {
    db.tickets.findFirst.mockResolvedValue({ id: 'example-ticket', title: 'Example ticket original title', projectId: 'example-project' });
    const entry = await service.createEntry('example-org', 'example-member', { workDate: '2026-10-24', hours: 2, ticketId: 'example-ticket', projectId: 'invented-forged-project', description: 'Ignored caller text' });
    expect(entry).toMatchObject({ ticketId: 'example-ticket', projectId: 'example-project', description: 'Example ticket original title', task: 'Example ticket original title' });
    db.tickets.findFirst.mockResolvedValue({ id: 'example-ticket', title: 'Example revised title', projectId: null });
    expect(entry.description).toBe('Example ticket original title');
    const updated = await service.updateEntry(stored.id, 'example-org', 'example-member', { ticketId: 'example-ticket' }); expect(updated.description).toBe('Example revised title'); expect(updated.projectId).toBeNull();
    const call = (db.tickets.findFirst.mock.calls as unknown[][])[0][0] as { where: object };
    expect(JSON.stringify(call.where)).toContain('createdById'); expect(JSON.stringify(call.where)).toContain('members');
  });
  it('requires trimmed description without a ticket, enforces limits and retains the legacy task fallback', async () => {
    for (const description of ['', '   ', 'x'.repeat(1001)]) await expect(service.createEntry('example-org', 'example-member', { workDate: '2026-10-24', hours: 1, description })).rejects.toThrow('Description');
    const legacy = await service.createEntry('example-org', 'example-member', { workDate: '2026-10-24', hours: 1, task: 'Legacy example task' }); expect(legacy.task).toBe('Legacy example task');
  });
  it('rejects an ineligible ticket or a non-member project', async () => {
    db.tickets.findFirst.mockResolvedValue(null); await expect(service.createEntry('example-org', 'example-member', { workDate: '2026-10-24', hours: 1, ticketId: 'example-hidden-ticket' })).rejects.toThrow(ForbiddenException);
    db.project.findFirst.mockResolvedValueOnce({ id: 'example-project', isArchived: false }).mockResolvedValueOnce(null); await expect(service.createEntry('example-org', 'example-member', { workDate: '2026-10-24', hours: 1, projectId: 'example-project', description: 'Example' })).rejects.toThrow(ForbiddenException);
  });
  it('blocks member submitted edits and scopes members to their own entries', async () => {
    stored.status = 'SUBMITTED'; await expect(service.updateEntry(stored.id, 'example-org', 'example-member', { hours: 1 })).rejects.toThrow(ForbiddenException);
    await expect(service.updateEntry(stored.id, 'example-org', 'another-example-member', { hours: 1 })).rejects.toThrow('not found'); expect(db.timesheetEntry.update).not.toHaveBeenCalled();
  });
  it('audits an admin correction of another submitted entry with both snapshots and the editor, retaining submitted status', async () => {
    stored.status = 'SUBMITTED'; await service.updateEntry(stored.id, 'example-org', 'example-admin', { hours: 3, description: 'Corrected example work' });
    expect(stored.status).toBe('SUBMITTED'); const audit = (db.timesheetAuditLog.create.mock.calls as unknown[][])[0][0] as { data: { actorMemberId: string; targetUserId: string; before: { hours: number }; after: { hours: number } } };
    expect(audit.data).toMatchObject({ actorMemberId: 'example-admin-membership', targetUserId: 'example-member', before: { hours: 2 }, after: { hours: 3 } });
    expect(db.timesheetEntry.aggregate).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ userId: 'example-member' }) as unknown }));
    expect(savedNotifications).toEqual([expect.objectContaining({ type: 'timesheet_edited_by_admin', recipientUserId: 'example-member' })]);
  });
  it('allows admin approval of another admin and self-approval with an explicit audit marker', async () => {
    stored.status = 'SUBMITTED'; stored.userId = 'example-admin'; await service.bulkApproveEntries('example-org', 'example-owner', { entryIds: [stored.id] }); expect(stored.status).toBe('APPROVED'); expect(savedNotifications[0]).toMatchObject({ type: 'timesheet_approved', recipientUserId: 'example-admin' });
    savedNotifications.length = 0; db.timesheetAuditLog.createMany.mockClear(); stored.status = 'SUBMITTED'; await service.bulkApproveEntries('example-org', 'example-admin', { entryIds: [stored.id] });
    const audit = (db.timesheetAuditLog.createMany.mock.calls as unknown[][])[0][0] as { data: { after: { selfApproval: boolean } }[] }; expect(audit.data[0].after.selfApproval).toBe(true); expect(savedNotifications).toHaveLength(0);
  });
  it('notifies all organization admins/owners on submission, excluding an admin submitter', async () => {
    stored.userId = 'example-admin'; await service.submitWeek('example-org', 'example-admin', { periodStart: '2026-10-19', periodEnd: '2026-10-25' });
    expect(savedNotifications.map(item => item.recipientUserId)).toEqual(['example-owner']); expect(savedNotifications[0]).toMatchObject({ type: 'timesheet_submitted', link: '/timekeeping/timesheet/approval' });
  });
  it('includes the reason in rejection and links the entry owner to the correct week and entry', async () => {
    stored.status = 'SUBMITTED'; await service.bulkRejectEntries('example-org', 'example-admin', { entryIds: [stored.id], reason: '  Example correction needed  ' });
    expect(savedNotifications[0]).toMatchObject({ type: 'timesheet_rejected', recipientUserId: 'example-member', body: 'Example work - Example correction needed', link: expect.stringContaining('date=2026-10-24&entry=example-entry') as unknown });
  });
  const act = async (type: string, service: TimesheetService, row: typeof baseEntry) => {
    if (type === NOTIFICATION_TYPES.timesheetSubmitted) return service.submitWeek('example-org', 'example-member', { periodStart: '2026-10-19', periodEnd: '2026-10-25' });
    row.status = 'SUBMITTED';
    if (type === NOTIFICATION_TYPES.timesheetApproved) return service.bulkApproveEntries('example-org', 'example-admin', { entryIds: [row.id] });
    if (type === NOTIFICATION_TYPES.timesheetRejected) return service.bulkRejectEntries('example-org', 'example-admin', { entryIds: [row.id], reason: 'Example reason' });
    return service.updateEntry(row.id, 'example-org', 'example-admin', { hours: 3 });
  };
  it.each([NOTIFICATION_TYPES.timesheetSubmitted, NOTIFICATION_TYPES.timesheetApproved, NOTIFICATION_TYPES.timesheetRejected, NOTIFICATION_TYPES.timesheetEditedByAdmin])('contains insert and emit failures for %s after commit', async type => {
    db.notification.create.mockRejectedValueOnce(new Error('Invented notification insert failure')); await expect(act(type, service, stored)).resolves.toBeDefined();
    stored = { ...baseEntry }; events.emit.mockImplementation(() => { throw new Error('Invented emit failure'); }); await expect(act(type, service, stored)).resolves.toBeDefined();
    expect(db.timesheetAuditLog.create.mock.calls.length + db.timesheetAuditLog.createMany.mock.calls.length).toBeGreaterThan(0);
  });
  it('contains a failed notification dependency and never notifies a rolled-back correction', async () => {
    stored.status = 'SUBMITTED'; const createMany = jest.spyOn(notifications, 'createMany').mockRejectedValue(new Error('Invented dependency failure')); await expect(service.updateEntry(stored.id, 'example-org', 'example-admin', { hours: 3 })).resolves.toBeDefined();
    db.timesheetEntry.update.mockRejectedValueOnce(new Error('Invented rollback')); await expect(service.updateEntry(stored.id, 'example-org', 'example-admin', { hours: 4 })).rejects.toThrow('rollback'); expect(createMany).toHaveBeenCalledTimes(1);
  });
});
