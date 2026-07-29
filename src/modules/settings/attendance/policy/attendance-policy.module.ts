import { Module } from '@nestjs/common';

import { AttendancePolicyController } from './attendance-policy.controller';
import { AttendancePolicyService } from './attendance-policy.service';

@Module({
  controllers: [AttendancePolicyController],
  providers: [AttendancePolicyService],
  exports: [AttendancePolicyService],
})
export class AttendancePolicyModule {}
