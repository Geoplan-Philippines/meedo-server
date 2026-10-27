import { Prisma } from '@prisma/client';

/** Max length of an admin-set project or client display name. */
export const DISPLAY_NAME_MAX_LENGTH = 200;

type ProjectNameFields = {
  displayName?: string | null;
  quoteSubject?: string | null;
  workOrderNumber: string;
};

type ClientNameFields = {
  displayName?: string | null;
  customerName: string;
};

const nonBlank = (value: string | null | undefined): string | null => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
};

/** Shown project name: the admin's displayName, else the Apptivo quote subject, else the WO number. */
export function projectDisplayName(project: ProjectNameFields): string {
  return nonBlank(project.displayName) ?? nonBlank(project.quoteSubject) ?? project.workOrderNumber;
}

/** Shown client name: the admin's displayName, else the Apptivo customer name. */
export function clientDisplayName(client: ClientNameFields): string {
  return nonBlank(client.displayName) ?? client.customerName;
}

/** SQL twin of projectDisplayName for raw queries; expects the projects table aliased as `p`. */
export const PROJECT_DISPLAY_NAME_SQL = Prisma.sql`COALESCE(NULLIF(BTRIM(p.display_name), ''), NULLIF(BTRIM(p.quote_subject), ''), p.work_order_number)`;

/** SQL twin of clientDisplayName; expects the clients table aliased as `c`. NULL when there is no client. */
export const CLIENT_DISPLAY_NAME_SQL = Prisma.sql`COALESCE(NULLIF(BTRIM(c.display_name), ''), c.customer_name)`;

/** Trims an admin-entered name; blank means "clear it" and becomes null. */
export function normalizeDisplayName(value: string | null | undefined): string | null | undefined {
  if (value === undefined) return undefined;
  return nonBlank(value);
}
