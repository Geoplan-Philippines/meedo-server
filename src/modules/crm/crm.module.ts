import { Module } from '@nestjs/common';
import { LeadsModule } from './leads/leads.module';
import { NewsletterModule } from './newsletter/newsletter.module';

@Module({
  imports: [NewsletterModule, LeadsModule]
})
export class CrmModule {}