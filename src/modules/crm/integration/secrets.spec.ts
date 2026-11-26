import { createHmac } from 'node:crypto';

import {
  generateIntegrationKey,
  hashSecret,
  signWebhookBody,
  webhookRawBody,
} from './secrets';

describe('integration secrets', () => {
  it('generates mdo_pk_ keys and stores only a hash', () => {
    const key = generateIntegrationKey();
    expect(key.startsWith('mdo_pk_')).toBe(true);
    expect(hashSecret(key)).toHaveLength(64);
    expect(hashSecret(key)).not.toBe(key);
  });

  it('signs the raw JSON body as X-Meedo-Signature sha256 hex HMAC', () => {
    const payload = { id: 'evt_1', type: 'lead.created', data: { id: 'lead-1' } };
    const rawBody = webhookRawBody(payload);
    const secret = 'whsec_test';
    const expected = `sha256=${createHmac('sha256', secret).update(rawBody).digest('hex')}`;
    expect(signWebhookBody(secret, rawBody)).toBe(expected);
    expect(rawBody).toBe(JSON.stringify(payload));
  });
});
