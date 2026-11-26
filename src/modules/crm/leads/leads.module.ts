import { Module } from '@nestjs/common';

import { IntegrationModule } from '../integration/integration.module';
import { LeadsController } from './leads.controller';
import { LeadsService } from './leads.service';

@Module({
  imports: [IntegrationModule],
  controllers: [LeadsController],
  providers: [LeadsService],
})
export class LeadsModule {}
