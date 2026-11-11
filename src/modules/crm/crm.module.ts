import { Module } from '@nestjs/common';
import { LeadsModule } from './leads/leads.module';
import { NewsletterModule } from './newsletter/newsletter.module';
import { CampaignsModule } from './newsletter/campaigns/campaigns.module';

@Module({
  imports: [NewsletterModule, LeadsModule, CampaignsModule]
})
export class CrmModule {}
