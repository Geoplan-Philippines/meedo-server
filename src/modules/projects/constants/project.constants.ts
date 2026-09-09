import { Prisma } from '@prisma/client';

export const PROJECT_NAME_MAX_LENGTH = 120;
export const PROJECT_DESCRIPTION_MAX_LENGTH = 5000;

/** Uppercase letters/digits only, so keys render cleanly as "ENG-12". */
export const PROJECT_KEY_PATTERN = /^[A-Z][A-Z0-9]{1,5}$/;
export const PROJECT_KEY_MAX_LENGTH = 6;

/** Suffix appended to the organization name for its catch-all internal project. */
export const INTERNAL_PROJECT_SUFFIX = 'Internal';
export const INTERNAL_PROJECT_KEY = 'INT';

const PROJECT_USER_SELECT = {
  id: true,
  name: true,
  email: true,
  image: true,
} satisfies Prisma.UserSelect;

const PROJECT_MEMBER_INCLUDE = {
  member: {
    include: { user: { select: PROJECT_USER_SELECT } },
  },
} satisfies Prisma.ProjectMemberInclude;

export const PROJECT_INCLUDE = {
  lead: {
    include: { user: { select: PROJECT_USER_SELECT } },
  },
  members: {
    include: PROJECT_MEMBER_INCLUDE,
    orderBy: { createdAt: 'asc' },
  },
  workOrder: {
    select: {
      id: true,
      workOrderNumber: true,
      customerName: true,
      client: { select: { customerName: true } },
    },
  },
  _count: { select: { tickets: true } },
} satisfies Prisma.ProjectInclude;

export type ProjectWithRelations = Prisma.ProjectGetPayload<{ include: typeof PROJECT_INCLUDE }>;

export const PROJECT_SORTABLE_FIELDS = [
  'name',
  'state',
  'priority',
  'startDate',
  'targetDate',
  'createdAt',
] as const;
export type ProjectSortField = (typeof PROJECT_SORTABLE_FIELDS)[number];

/**
 * Derives a key candidate from a project name: initials for multi-word names
 * ("Field Ops" -> "FO"), otherwise the leading characters ("Engineering" -> "ENG").
 * Callers must still run it through uniqueness resolution.
 */
export function deriveProjectKey(name: string): string {
  const words = name
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .split(' ')
    .filter(Boolean);

  if (words.length === 0) {
    return 'PRJ';
  }

  const candidate =
    words.length === 1
      ? words[0].slice(0, 3)
      : words.map((word) => word[0]).join('').slice(0, PROJECT_KEY_MAX_LENGTH);

  // A key needs at least two characters, and must not start with a digit.
  const padded = candidate.length >= 2 ? candidate : `${candidate}X`;
  return /^[A-Z]/.test(padded) ? padded : `P${padded}`.slice(0, PROJECT_KEY_MAX_LENGTH);
}
