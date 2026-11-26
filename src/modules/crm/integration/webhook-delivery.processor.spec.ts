import { WebhookDeliveryStatus } from '@prisma/client';

import { PrismaService } from '../../../core/database/prisma.service';
import { signWebhookBody, webhookRawBody } from './secrets';
import { WebhookDeliveryProcessor } from './webhook-delivery.processor';

describe('WebhookDeliveryProcessor', () => {
  const prisma = {
    webhookDelivery: { update: jest.fn() },
  };
  const processor = new WebhookDeliveryProcessor(prisma as unknown as PrismaService);
  const payload = { id: 'evt_1', type: 'lead.created', data: { id: 'lead-1' } };
  const secret = 'mdo_wh_test';

  beforeEach(() => {
    jest.resetAllMocks();
    prisma.webhookDelivery.update.mockResolvedValue({});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('posts the raw body with X-Meedo-Signature sha256 HMAC', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({ ok: true, status: 200 } as Response);
    await processor.attempt({
      id: 'del-1',
      payload,
      attemptCount: 0,
      endpoint: { url: 'https://example.com/hook', secret, isEnabled: true },
    });
    const rawBody = webhookRawBody(payload);
    expect(fetchMock).toHaveBeenCalledWith('https://example.com/hook', expect.objectContaining({
      method: 'POST',
      body: rawBody,
      headers: expect.objectContaining({
        'X-Meedo-Signature': signWebhookBody(secret, rawBody),
      }),
    }));
    expect(prisma.webhookDelivery.update).toHaveBeenCalledWith({
      where: { id: 'del-1' },
      data: expect.objectContaining({ status: WebhookDeliveryStatus.DELIVERED, responseStatus: 200 }),
    });
  });
});
