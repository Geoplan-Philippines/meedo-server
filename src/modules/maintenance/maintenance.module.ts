import { Module } from '@nestjs/common';
import { ProjectsModule } from './projects/projects.module';
import { TicketCategoriesModule } from './ticket-categories/ticket-categories.module';

@Module({
  controllers: [],
  providers: [],
  imports: [
    ProjectsModule, 
    TicketCategoriesModule,
  ],
})

export class MaintenanceModule {}