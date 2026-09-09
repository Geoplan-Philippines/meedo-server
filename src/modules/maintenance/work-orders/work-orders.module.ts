import { Module } from '@nestjs/common';
import { WorkOrdersService } from './work-orders.service';
import { WorkOrdersController } from './work-orders.controller';
import { ClientsModule } from '../clients/clients.module';
import { ProjectsModule } from '../../projects/projects.module';

@Module({
  imports: [ClientsModule, ProjectsModule],
  controllers: [WorkOrdersController],
  providers: [WorkOrdersService],
})
export class WorkOrdersModule {}
