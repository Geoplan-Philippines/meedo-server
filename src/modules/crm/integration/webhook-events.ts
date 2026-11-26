export const WEBHOOK_EVENTS = ['lead.created', 'subscriber.created', 'subscriber.unsubscribed'] as const;
export type WebhookEventName = (typeof WEBHOOK_EVENTS)[number];

export const WEBHOOK_MAX_ATTEMPTS = 4;
export const WEBHOOK_TIMEOUT_MS = 5_000;
export const WEBHOOK_BACKOFF_MS = [30_000, 120_000, 600_000];
