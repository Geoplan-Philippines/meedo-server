import { IsDateString, IsIn, IsOptional } from 'class-validator';

import { MANUAL_EVENT_TYPES, type ManualEventType } from '../constants/attendance.constants';

export class CreateAttendanceEventDTO {
  @IsIn(MANUAL_EVENT_TYPES, {
    message: `eventType must be one of: ${MANUAL_EVENT_TYPES.join(', ')}`,
  })
  eventType!: ManualEventType;

  /**
   * When the event occurred. Optional — defaults to now. Lets clients record a
   * tap they forgot to log earlier, but never a future timestamp.
   */
  @IsOptional()
  @IsDateString()
  timestamp?: string;
}
