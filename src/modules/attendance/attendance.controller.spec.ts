import { SetMetadata } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AttendanceEventType } from '@prisma/client';

import { AttendanceController } from './attendance.controller';
import { AttendanceService } from './attendance.service';
import { BiometricSyncService } from './biometrics/biometric-sync.service';
import { AttendanceUpdatesGuard } from './attendance-updates.guard';
import { AttendanceUpdatesService } from './attendance-updates.service';

jest.mock('@thallesp/nestjs-better-auth', () => ({
  ...jest.requireActual<Record<string, unknown>>('@thallesp/nestjs-better-auth'),
  OptionalAuth: () => SetMetadata('OPTIONAL', true),
}));

const mockAttendanceService = {
  resolveUpdateScope: jest.fn(),
  recordAttendanceEvent: jest.fn(),
  getMyAttendanceEvents: jest.fn(),
  getDailyAttendance: jest.fn(),
  getMyAttendanceHistory: jest.fn(),
};

describe('AttendanceController', () => {
  let controller: AttendanceController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AttendanceController],
      providers: [
        { provide: AttendanceService, useValue: mockAttendanceService },
        { provide: BiometricSyncService, useValue: {} },
        { provide: AttendanceUpdatesService, useValue: { stream: jest.fn() } },
      ],
    }).overrideGuard(AttendanceUpdatesGuard).useValue({ canActivate: () => true }).compile();

    controller = module.get<AttendanceController>(AttendanceController);
    jest.resetAllMocks();
  });

  it('forwards a recorded event to the service for the current employee', async () => {
    const event = { id: 'event-1' };
    mockAttendanceService.recordAttendanceEvent.mockResolvedValue(event);

    const body = { eventType: AttendanceEventType.FIELD_IN };
    const result = await controller.recordAttendanceEvent(body, 'employee-1');

    expect(mockAttendanceService.recordAttendanceEvent).toHaveBeenCalledWith('employee-1', body);
    expect(result).toBe(event);
  });

  it('does not open a stream without a resolved scope', () => {
    expect(() => controller.attendanceUpdateStream({})).toThrow('A signed-in organization member is required.');
  });

  it('scopes the daily summary to the current employee', async () => {
    const summary = { date: new Date(), firstIn: null, lastOut: null, billableHours: null, events: [] };
    mockAttendanceService.getDailyAttendance.mockResolvedValue(summary);

    const result = await controller.getMyDailyAttendance('org-1', 'employee-1', '2026-06-25');

    expect(mockAttendanceService.getDailyAttendance).toHaveBeenCalledWith('org-1', 'employee-1', '2026-06-25');
    expect(result).toBe(summary);
  });
});
