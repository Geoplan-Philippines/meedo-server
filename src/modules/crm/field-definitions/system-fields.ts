import { FieldCollection, FieldType, type PrismaClient } from '@prisma/client';

export const FIELD_KEY_PATTERN = /^[a-z][a-zA-Z0-9]*$/;
export const FIELD_KEY_MAX_LENGTH = 40;
export const TEXT_MAX_LENGTH = 500;
export const LONG_TEXT_MAX_LENGTH = 5000;
export const URL_MAX_LENGTH = 2048;

export const LEAD_WRITABLE_COLUMNS = [
  'firstName',
  'lastName',
  'email',
  'company',
  'phoneNumber',
  'message',
  'source',
] as const;

export type LeadWritableColumn = (typeof LEAD_WRITABLE_COLUMNS)[number];

export const SUBSCRIBER_WRITABLE_COLUMNS = ['name', 'email', 'source'] as const;
export type SubscriberWritableColumn = (typeof SUBSCRIBER_WRITABLE_COLUMNS)[number];

export type SystemFieldSeed = {
  key: string;
  label: string;
  type: FieldType;
  options: string[];
  isRequired: boolean;
  isReadOnly: boolean;
  position: number;
};

export const LEAD_SYSTEM_FIELDS: SystemFieldSeed[] = [
  { key: 'firstName', label: 'First name', type: 'text', options: [], isRequired: true, isReadOnly: false, position: 0 },
  { key: 'lastName', label: 'Last name', type: 'text', options: [], isRequired: true, isReadOnly: false, position: 1 },
  { key: 'email', label: 'Email', type: 'text', options: [], isRequired: true, isReadOnly: false, position: 2 },
  { key: 'company', label: 'Company', type: 'text', options: [], isRequired: false, isReadOnly: false, position: 3 },
  { key: 'phoneNumber', label: 'Phone', type: 'text', options: [], isRequired: false, isReadOnly: false, position: 4 },
  { key: 'message', label: 'Message', type: 'long_text', options: [], isRequired: true, isReadOnly: false, position: 5 },
  { key: 'source', label: 'Source', type: 'url', options: [], isRequired: false, isReadOnly: false, position: 6 },
  { key: 'status', label: 'Status', type: 'select', options: ['NEW', 'CONTACTED', 'QUALIFIED', 'LOST'], isRequired: false, isReadOnly: true, position: 7 },
  { key: 'isArchived', label: 'Archived', type: 'select', options: ['true', 'false'], isRequired: false, isReadOnly: true, position: 8 },
  { key: 'receivedAt', label: 'Received', type: 'datetime', options: [], isRequired: false, isReadOnly: true, position: 9 },
];

export const SUBSCRIBER_SYSTEM_FIELDS: SystemFieldSeed[] = [
  { key: 'name', label: 'Name', type: 'text', options: [], isRequired: false, isReadOnly: false, position: 0 },
  { key: 'email', label: 'Email', type: 'text', options: [], isRequired: true, isReadOnly: false, position: 1 },
  { key: 'source', label: 'Source', type: 'url', options: [], isRequired: false, isReadOnly: false, position: 2 },
  { key: 'status', label: 'Status', type: 'select', options: ['SUBSCRIBED', 'UNSUBSCRIBED'], isRequired: false, isReadOnly: true, position: 3 },
  { key: 'consentAt', label: 'Consent date', type: 'datetime', options: [], isRequired: false, isReadOnly: true, position: 4 },
];

export function systemFieldsFor(collection: FieldCollection): SystemFieldSeed[] {
  return collection === 'lead' ? LEAD_SYSTEM_FIELDS : SUBSCRIBER_SYSTEM_FIELDS;
}

export async function seedSystemFields(
  prisma: PrismaClient,
  organizationId: string,
  collection: FieldCollection,
): Promise<void> {
  const fields = systemFieldsFor(collection);
  await prisma.fieldDefinition.createMany({
    data: fields.map((field) => ({
      organizationId,
      collection,
      key: field.key,
      label: field.label,
      type: field.type,
      options: field.options,
      isRequired: field.isRequired,
      isReadOnly: field.isReadOnly,
      isSystem: true,
      position: field.position,
    })),
    skipDuplicates: true,
  });
}

export async function seedLeadSystemFields(prisma: PrismaClient, organizationId: string): Promise<void> {
  await seedSystemFields(prisma, organizationId, 'lead');
}

export async function seedSubscriberSystemFields(prisma: PrismaClient, organizationId: string): Promise<void> {
  await seedSystemFields(prisma, organizationId, 'subscriber');
}
