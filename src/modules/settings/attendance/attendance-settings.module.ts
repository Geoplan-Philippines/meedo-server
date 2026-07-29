import { Module } from '@nestjs/common';

import { ScheduleAssignmentsModule } from './assignments/schedule-assignments.module';
import { HolidaysModule } from './holidays/holidays.module';
import { AttendancePolicyModule } from './policy/attendance-policy.module';
import { ShiftsModule } from './shifts/shifts.module';
import { WeeklySchedulesModule } from './weekly-schedules/weekly-schedules.module';

/**
 * "Attendance Settings" umbrella. Each area (shifts, weekly schedules, holidays,
 * policy, assignments) is a self-contained module; this parent only aggregates
 * them so `app.module` registers a single import.
 */
@Module({
  imports: [
    ShiftsModule,
    WeeklySchedulesModule,
    HolidaysModule,
    AttendancePolicyModule,
    ScheduleAssignmentsModule,
  ],
})
export class AttendanceSettingsModule {}
