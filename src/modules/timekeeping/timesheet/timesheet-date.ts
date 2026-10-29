import { BadRequestException } from '@nestjs/common';

export function manilaToday(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

/** Work dates are calendar dates stored at UTC midnight, not UTC instants of work. */
export function assertNotFutureWorkDate(workDate: Date, now = new Date()): void {
  if (workDate.toISOString().slice(0, 10) > manilaToday(now)) {
    throw new BadRequestException('Work date cannot be in the future (Asia/Manila).');
  }
}
