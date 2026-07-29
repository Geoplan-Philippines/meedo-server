import { Module } from '@nestjs/common';

import { WeeklySchedulesController } from './weekly-schedules.controller';
import { WeeklySchedulesService } from './weekly-schedules.service';

@Module({
  controllers: [WeeklySchedulesController],
  providers: [WeeklySchedulesService],
  exports: [WeeklySchedulesService],
})
export class WeeklySchedulesModule {}
