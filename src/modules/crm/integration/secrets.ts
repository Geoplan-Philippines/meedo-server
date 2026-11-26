import { createHash, createHmac, randomBytes } from 'node:crypto';

export const INTEGRATION_KEY_PREFIX = 'mdo_pk_';
export const WEBHOOK_SECRET_PREFIX = 'mdo_wh_';
export const WEBHOOK_SIGNATURE_HEADER = 'X-Meedo-Signature';

export function generateIntegrationKey(): string {
  return `${INTEGRATION_KEY_PREFIX}${randomBytes(32).toString('base64url')}`;
}

export function generateWebhookSecret(): string {
  return `${WEBHOOK_SECRET_PREFIX}${randomBytes(32).toString('base64url')}`;
}

export function hashSecret(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function displayPrefix(value: string, length = 12): string {
  return value.slice(0, length);
}

export function signWebhookBody(secret: string, rawBody: string): string {
  return `sha256=${createHmac('sha256', secret).update(rawBody).digest('hex')}`;
}

export function webhookRawBody(payload: unknown): string {
  return JSON.stringify(payload);
}
