import { Module } from '@nestjs/common';
import { WorkOrdersModule } from './work-orders/work-orders.module';
import { TicketCategoriesModule } from './ticket-categories/ticket-categories.module';
import { ClientsModule } from './clients/clients.module';

@Module({
  controllers: [],
  providers: [],
  imports: [
    WorkOrdersModule,
    TicketCategoriesModule,
    ClientsModule,
  ],
})

export class MaintenanceModule {}
