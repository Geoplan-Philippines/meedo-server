import { Module } from '@nestjs/common';
import { FieldDefinitionsModule } from './field-definitions/field-definitions.module';
import { IntegrationModule } from './integration/integration.module';
import { LeadsModule } from './leads/leads.module';
import { NewsletterModule } from './newsletter/newsletter.module';
import { CampaignsModule } from './newsletter/campaigns/campaigns.module';

@Module({
  imports: [NewsletterModule, LeadsModule, CampaignsModule, FieldDefinitionsModule, IntegrationModule]
})
export class CrmModule {}
