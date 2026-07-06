import { Test, TestingModule } from '@nestjs/testing';
import { AttendanceEventType } from '@prisma/client';

import { AttendanceController } from './attendance.controller';
import { AttendanceService } from './attendance.service';

const mockAttendanceService = {
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
      providers: [{ provide: AttendanceService, useValue: mockAttendanceService }],
    }).compile();

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

  it('scopes the daily summary to the current employee', async () => {
    const summary = { date: new Date(), firstIn: null, lastOut: null, billableHours: null, events: [] };
    mockAttendanceService.getDailyAttendance.mockResolvedValue(summary);

    const result = await controller.getMyDailyAttendance('employee-1', '2026-06-25');

    expect(mockAttendanceService.getDailyAttendance).toHaveBeenCalledWith('employee-1', '2026-06-25');
    expect(result).toBe(summary);
  });
});
