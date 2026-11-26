export const DEFAULT_PUBLIC_ORG_SLUG = 'geoplan-philippines-inc';

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export const lowercaseEmail = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? normalizeEmail(value) : value;
