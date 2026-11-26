import { NewsletterSubscriber, Prisma } from '@prisma/client';

import { SUBSCRIBER_WRITABLE_COLUMNS, type SubscriberWritableColumn } from '../../field-definitions/system-fields';

export type SubscriberResponse = Omit<NewsletterSubscriber, 'unsubscribeToken'>;

export function asValueMap(value: Prisma.JsonValue | null | undefined): Record<string, unknown> {
  if (value === null || value === undefined || typeof value !== 'object' || Array.isArray(value)) return {};
  return { ...(value as Record<string, unknown>) };
}

export function hideUnsubscribeToken(subscriber: NewsletterSubscriber): SubscriberResponse {
  const { unsubscribeToken: _token, ...rest } = subscriber;
  return rest;
}

export function subscriberCurrentValues(subscriber: NewsletterSubscriber): Record<string, unknown> {
  return {
    name: subscriber.name,
    email: subscriber.email,
    source: subscriber.source,
    status: subscriber.status,
    consentAt: subscriber.consentAt?.toISOString() ?? null,
    ...asValueMap(subscriber.values),
  };
}

export function splitSubscriberValues(
  normalized: Record<string, unknown>,
  existingCustom: Record<string, unknown>,
): { columns: Pick<Prisma.NewsletterSubscriberCreateInput, SubscriberWritableColumn>; custom: Record<string, unknown> } {
  const writable = new Set<string>(SUBSCRIBER_WRITABLE_COLUMNS);
  const columns: Record<string, unknown> = {};
  const custom = { ...existingCustom };
  for (const [key, value] of Object.entries(normalized)) {
    if (writable.has(key)) {
      columns[key] = value;
      continue;
    }
    if (value === null) delete custom[key];
    else custom[key] = value;
  }
  return {
    columns: columns as Pick<Prisma.NewsletterSubscriberCreateInput, SubscriberWritableColumn>,
    custom,
  };
}

export function subscriberFieldValue(subscriber: NewsletterSubscriber, key: string): unknown {
  return subscriberCurrentValues(subscriber)[key] ?? null;
}
