import { Module } from '@nestjs/common';
import { ProjectsModule } from './projects/projects.module';
import { TicketCategoriesModule } from './ticket-categories/ticket-categories.module';
import { ClientsModule } from './clients/clients.module';

@Module({
  controllers: [],
  providers: [],
  imports: [
    ProjectsModule, 
    TicketCategoriesModule,
    ClientsModule,
  ],
})

export class MaintenanceModule {}