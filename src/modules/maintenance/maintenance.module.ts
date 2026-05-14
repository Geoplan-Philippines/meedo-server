import { Module } from '@nestjs/common';
import { MaintenanceService } from './maintenance.service';
import { MaintenanceController } from './maintenance.controller';
import { ProjectsModule } from './projects/projects.module';
import { TicketCategoriesModule } from './ticket-categories/ticket-categories.module';

@Module({
  controllers: [MaintenanceController],
  providers: [MaintenanceService],
  imports: [
    ProjectsModule, 
    TicketCategoriesModule,
  ],
})
export class MaintenanceModule {}
