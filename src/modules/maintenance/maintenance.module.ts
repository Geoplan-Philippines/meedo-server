import { Module } from '@nestjs/common';
import { MaintenanceService } from './maintenance.service';
import { MaintenanceController } from './maintenance.controller';
import { ProjectsModule } from './projects/projects.module';
import { TicketCategoriesModule } from './ticket-categories/ticket-categories.module';
import { ApptivoTicketsModule } from './tickets/tickets.module';

@Module({
  controllers: [MaintenanceController],
  providers: [MaintenanceService],
  imports: [
    ProjectsModule, 
    TicketCategoriesModule,
    ApptivoTicketsModule
  ],
})
export class MaintenanceModule {}
