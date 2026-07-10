import { Module } from '@nestjs/common';

import { AttendancePolicyModule } from '../policy/attendance-policy.module';
import { ScheduleAssignmentsController } from './schedule-assignments.controller';
import { ScheduleAssignmentsService } from './schedule-assignments.service';
import { ScheduleResolverService } from './resolver/schedule-resolver.service';

@Module({
  imports: [AttendancePolicyModule],
  controllers: [ScheduleAssignmentsController],
  providers: [ScheduleAssignmentsService, ScheduleResolverService],
  exports: [ScheduleResolverService],
})
export class ScheduleAssignmentsModule {}
