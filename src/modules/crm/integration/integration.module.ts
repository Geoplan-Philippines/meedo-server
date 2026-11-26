import { Module } from '@nestjs/common';

import { PublicSubmitController } from '../public/public-submit.controller';
import { PublicSubmitService } from '../public/public-submit.service';
import { CrmEventsService } from './crm-events.service';
import { IntegrationDocsController } from './integration-docs.controller';
import { IntegrationKeyGuard } from './integration-key.guard';
import { IntegrationKeysController } from './integration-keys.controller';
import { IntegrationKeysService } from './integration-keys.service';
import { WebhookDeliveryProcessor } from './webhook-delivery.processor';
import { WebhooksController } from './webhooks.controller';
import { WebhooksService } from './webhooks.service';

@Module({
  controllers: [
    PublicSubmitController,
    IntegrationKeysController,
    WebhooksController,
    IntegrationDocsController,
  ],
  providers: [
    PublicSubmitService,
    IntegrationKeyGuard,
    IntegrationKeysService,
    WebhooksService,
    CrmEventsService,
    WebhookDeliveryProcessor,
  ],
  exports: [CrmEventsService],
})
export class IntegrationModule {}
