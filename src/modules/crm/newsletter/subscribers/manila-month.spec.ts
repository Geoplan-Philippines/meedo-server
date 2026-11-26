import { startOfCurrentMonthManila } from './manila-month';

describe('startOfCurrentMonthManila', () => {
  it('is midnight on the first of the month in Asia/Manila', () => {
    const start = startOfCurrentMonthManila(new Date('2026-11-15T10:00:00+08:00'));
    expect(start.toISOString()).toBe('2026-10-31T16:00:00.000Z');
  });
});
