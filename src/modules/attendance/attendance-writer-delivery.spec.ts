import { SetMetadata } from '@nestjs/common';
import { AttendanceEventType, AttendanceSource } from '@prisma/client';
import { AttendanceService } from './attendance.service';
import { AttendanceUpdatesService } from './attendance-updates.service';
import { AttendanceScheduler } from './attendance.scheduler';
import { AttendanceController } from './attendance.controller';
import { BiometricSyncService } from './biometrics/biometric-sync.service';
import { PrismaService } from '../../core/database/prisma.service';
import { ScheduleResolverService } from '../settings/attendance/assignments/resolver/schedule-resolver.service';

jest.mock('@thallesp/nestjs-better-auth', () => ({
  ...jest.requireActual<Record<string, unknown>>('@thallesp/nestjs-better-auth'),
  OptionalAuth: () => SetMetadata('OPTIONAL', true),
}));

// Exercise the actual write paths, including transaction completion, before delivery.
describe('attendance writer delivery', () => {
  const timestamp = new Date('2026-11-01T01:00:00Z');
  const member = { findMany: jest.fn() };
  const event = { employeeId: 'a', timestamp, eventType: AttendanceEventType.FIELD_IN, source: AttendanceSource.FIELD, externalId: 'tap-a' };
  const tx = {
    attendanceEvent: { create: jest.fn(), createManyAndReturn: jest.fn(), findFirst: jest.fn() },
    attendance: { upsert: jest.fn(), deleteMany: jest.fn() },
  };
  const prisma = {
    member,
    user: { findMany: jest.fn() },
    attendanceEvent: { findMany: jest.fn() },
    $transaction: jest.fn(),
  };
  let updates: AttendanceUpdatesService;
  let service: AttendanceService;
  let a: jest.Mock; let b: jest.Mock; let owner: jest.Mock; let other: jest.Mock;
  let subscriptions: { unsubscribe(): void }[];
  beforeEach(() => {
    jest.resetAllMocks(); jest.useFakeTimers();
    member.findMany.mockResolvedValue([{ userId: 'a', organizationId: 'org' }]);
    prisma.user.findMany.mockResolvedValue([{ id: 'a', biometricsId: 'device-a' }]);
    prisma.attendanceEvent.findMany.mockResolvedValue([]);
    prisma.$transaction.mockImplementation((fn: (client: typeof tx) => unknown) => fn(tx));
    tx.attendanceEvent.create.mockResolvedValue(event);
    tx.attendanceEvent.createManyAndReturn.mockResolvedValue([event]);
    tx.attendanceEvent.findFirst.mockResolvedValue(event);
    updates = new AttendanceUpdatesService(prisma as unknown as PrismaService);
    service = new AttendanceService(prisma as unknown as PrismaService, {} as ScheduleResolverService, updates);
    a = jest.fn(); b = jest.fn(); owner = jest.fn(); other = jest.fn();
    subscriptions = [
      updates.stream({ userId: 'a', organizationId: 'org', isManager: false }).subscribe(a),
      updates.stream({ userId: 'b', organizationId: 'org', isManager: false }).subscribe(b),
      updates.stream({ userId: 'owner', organizationId: 'org', isManager: true }).subscribe(owner),
      updates.stream({ userId: 'other', organizationId: 'other', isManager: true }).subscribe(other),
    ];
  });
  afterEach(() => { subscriptions.forEach(s => s.unsubscribe()); updates.onModuleDestroy(); jest.useRealTimers(); });
  function expectDelivery(reason: string) {
    jest.advanceTimersByTime(750);
    const expected = { type: 'attendance.updated', data: { reasons: [reason], affected: [{ employeeId: 'a', date: '2026-11-01' }], timestamp: expect.any(String) as string } };
    expect(a).toHaveBeenCalledWith(expected); expect(owner).toHaveBeenCalledWith(expected);
    expect(b).not.toHaveBeenCalled(); expect(other).not.toHaveBeenCalled();
  }
  it('delivers a manual punch after commit', async () => {
    await service.recordAttendanceEvent('a', { eventType: AttendanceEventType.FIELD_IN, timestamp: timestamp.toISOString() });
    expectDelivery('manual');
  });
  it.each(['single', 'batch'])('delivers %s device ingestion without a session', async (kind) => {
    const controller = new AttendanceController(service, {} as BiometricSyncService, updates);
    const tap = { externalId: 'tap-a', biometricsId: 'device-a', timestamp: timestamp.toISOString() };
    if (kind === 'single') await controller.ingestBiometricEvent(tap);
    else await controller.ingestBiometricEvents({ events: [tap] });
    expectDelivery('biometric');
  });
  it('delivers biometric polling ingestion through the same writer', async () => {
    await service.ingestBiometricAccess([{ externalId: 'tap-a', biometricsId: 'device-a', timestamp }]);
    expectDelivery('biometric');
  });
  it('delivers scheduler changes only to the affected membership scopes', async () => {
    prisma.attendanceEvent.findMany.mockResolvedValue([event]);
    // Avoid wall clock dependence while exercising the scheduler's real service call.
    jest.setSystemTime(new Date('2026-11-01T11:00:00Z'));
    await new AttendanceScheduler(service).autoClockOut();
    expectDelivery('auto-clock-out');
  });
  it('does not notify when the transaction fails', async () => {
    prisma.$transaction.mockRejectedValue(new Error('rollback'));
    await expect(service.recordAttendanceEvent('a', { eventType: AttendanceEventType.FIELD_IN, timestamp: timestamp.toISOString() })).rejects.toThrow('rollback');
    jest.advanceTimersByTime(750);
    for (const callback of [a,b,owner,other]) expect(callback).not.toHaveBeenCalled();
  });
});
