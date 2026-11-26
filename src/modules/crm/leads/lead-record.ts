import { Lead, Prisma } from '@prisma/client';

import { LEAD_WRITABLE_COLUMNS, type LeadWritableColumn } from '../field-definitions/system-fields';

export function asValueMap(value: Prisma.JsonValue | null | undefined): Record<string, unknown> {
  if (value === null || value === undefined || typeof value !== 'object' || Array.isArray(value)) return {};
  return { ...(value as Record<string, unknown>) };
}

export function leadCurrentValues(lead: Lead): Record<string, unknown> {
  return {
    firstName: lead.firstName,
    lastName: lead.lastName,
    email: lead.email,
    company: lead.company,
    phoneNumber: lead.phoneNumber,
    message: lead.message,
    source: lead.source,
    status: lead.status,
    isArchived: String(lead.isArchived),
    receivedAt: lead.receivedAt.toISOString(),
    ...asValueMap(lead.values),
  };
}

export function splitLeadValues(
  normalized: Record<string, unknown>,
  existingCustom: Record<string, unknown>,
): { columns: Pick<Prisma.LeadCreateInput, LeadWritableColumn>; custom: Record<string, unknown> } {
  const writable = new Set<string>(LEAD_WRITABLE_COLUMNS);
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
  return { columns: columns as Pick<Prisma.LeadCreateInput, LeadWritableColumn>, custom };
}

export function leadFieldValue(lead: Lead, key: string): unknown {
  const current = leadCurrentValues(lead);
  return current[key] ?? null;
}
