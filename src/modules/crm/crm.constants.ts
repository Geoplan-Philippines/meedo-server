import { randomBytes } from 'node:crypto';

export const DEFAULT_PUBLIC_ORG_SLUG = 'geoplan-philippines-inc';

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function generateUnsubscribeToken(): string {
  return randomBytes(32).toString('base64url');
}

export const lowercaseEmail = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? normalizeEmail(value) : value;
