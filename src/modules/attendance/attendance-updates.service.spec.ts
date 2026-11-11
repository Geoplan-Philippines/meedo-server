import { AttendanceUpdatesService } from './attendance-updates.service';
import { AttendanceService } from './attendance.service';
import { PrismaService } from '../../core/database/prisma.service';
import { ScheduleResolverService } from '../settings/attendance/assignments/resolver/schedule-resolver.service';

describe('attendance update visibility', () => {
  const member = { findMany: jest.fn(), findFirst: jest.fn() };
  const prisma = { member } as unknown as PrismaService;
  let updates: AttendanceUpdatesService;
  beforeEach(() => { jest.useFakeTimers(); jest.resetAllMocks(); updates = new AttendanceUpdatesService(prisma); });
  afterEach(() => { updates.onModuleDestroy(); jest.useRealTimers(); });

  it.each(['biometric', 'manual', 'auto-clock-out'] as const)('filters mixed batches, organizations, reasons and dates for %s', async (reason) => {
    member.findMany.mockResolvedValue([
      { userId: 'a', organizationId: 'org' }, { userId: 'b', organizationId: 'org' },
      { userId: 'x', organizationId: 'other' }, { userId: 'a', organizationId: 'second' },
    ]);
    const received: Record<string, { affected: { employeeId: string; date: string }[] }[]> = {};
    const subscriptions = [['a', 'org', false], ['b', 'org', false], ['owner', 'org', true], ['admin', 'org', true], ['x', 'other', true], ['second', 'second', true]].map(([userId, organizationId, isManager]) => {
      received[String(userId)] = [];
      return updates.stream({ userId: String(userId), organizationId: String(organizationId), isManager: Boolean(isManager) }).subscribe((event) => received[String(userId)].push(event.data as { affected: { employeeId: string; date: string }[] }));
    });
    await updates.notifyEmployees(reason, [{ employeeId: 'a', date: '2026-11-01' }, { employeeId: 'b', date: '2026-11-02' }, { employeeId: 'x', date: '2026-11-03' }]);
    jest.advanceTimersByTime(750);
    expect(received.a[0].affected).toEqual([{ employeeId: 'a', date: '2026-11-01' }]);
    expect(received.b[0].affected).toEqual([{ employeeId: 'b', date: '2026-11-02' }]);
    for (const user of ['admin', 'owner']) expect(received[user][0].affected.map((t: { employeeId: string }) => t.employeeId)).toEqual(['a', 'b']);
    expect(received.x[0].affected).toEqual([{ employeeId: 'x', date: '2026-11-03' }]);
    expect(received.second[0].affected).toEqual([{ employeeId: 'a', date: '2026-11-01' }]);
    subscriptions.forEach((subscription) => subscription.unsubscribe());
    expect(jest.getTimerCount()).toBe(0);
  });

  it('delivers unknown organization only to self, never an admin; empty targets never broadcast', async () => {
    member.findMany.mockResolvedValue([]);
    const self = jest.fn(); const admin = jest.fn();
    const a = updates.stream({ userId: 'a', organizationId: 'org', isManager: false }).subscribe(self);
    const b = updates.stream({ userId: 'owner', organizationId: 'org', isManager: true }).subscribe(admin);
    await updates.notifyEmployees('manual', []);
    await updates.notifyEmployees('manual', [{ employeeId: 'a', date: '2026-11-01' }]);
    jest.advanceTimersByTime(750);
    expect(self).toHaveBeenCalledTimes(1); expect(admin).not.toHaveBeenCalled();
    a.unsubscribe(); b.unsubscribe();
    expect((updates as unknown as { updates: { observers: unknown[] } }).updates.observers).toHaveLength(0);
    await updates.notifyEmployees('manual', [{ employeeId: 'a', date: '2026-11-01' }]);
    jest.advanceTimersByTime(16000);
    expect(self).toHaveBeenCalledTimes(1); expect(jest.getTimerCount()).toBe(0);
  });

  it.each([[undefined, 'org'], ['a', undefined], ['a', 'org']])('rejects missing user, organization or membership (%s, %s)', async (user, org) => {
    member.findFirst.mockResolvedValue(null);
    const service = new AttendanceService(prisma, {} as ScheduleResolverService, updates);
    await expect(service.resolveUpdateScope(user, org)).rejects.toMatchObject({ status: 403 });
  });
  it.each(['owner', 'admin', 'member', 'manager'])('reuses the exact attendance manager rule for %s', async (role) => {
    member.findFirst.mockResolvedValue({ role });
    const service = new AttendanceService(prisma, {} as ScheduleResolverService, updates);
    await expect(service.resolveUpdateScope('a', 'org')).resolves.toEqual({ userId: 'a', organizationId: 'org', isManager: ['owner', 'admin'].includes(role) });
  });
});
