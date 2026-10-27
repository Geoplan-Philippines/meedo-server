import { ForbiddenException } from '@nestjs/common';
import { MaintenanceAuditEntity, Prisma } from '@prisma/client';
import { isOrgAdminRole } from '../../../common/constants/org-roles.constants';

/** { field: { from, to } } for each field whose value changed. */
export type FieldChanges = Record<string, { from: unknown; to: unknown }>;

/** Keeps only the keys of `next` whose value differs from `current`. */
export function diffFields<T extends Record<string, unknown>>(current: T, next: Partial<T>): FieldChanges {
  const changes: FieldChanges = {};
  for (const [field, to] of Object.entries(next)) {
    if (to !== undefined && to !== current[field]) {
      changes[field] = { from: current[field] ?? null, to };
    }
  }
  return changes;
}

/**
 * Member id of the acting owner/admin. The controllers already guard these edits with
 * @OrgRoles; this repeats the check next to the write so the rule holds for any caller.
 */
export async function resolveAdminActor(
  db: Pick<Prisma.TransactionClient, 'member'>,
  organizationId: string,
  userId: string | undefined,
): Promise<string> {
  const member = userId
    ? await db.member.findUnique({
        where: { organizationId_userId: { organizationId, userId } },
        select: { id: true, role: true },
      })
    : null;

  if (!member || !isOrgAdminRole(member.role)) {
    throw new ForbiddenException('Only organization owners and admins can edit projects and clients.');
  }
  return member.id;
}

export async function recordMaintenanceAudit(
  db: Pick<Prisma.TransactionClient, 'maintenanceAuditLog'>,
  params: {
    organizationId: string;
    entityType: MaintenanceAuditEntity;
    entityId: string;
    actorMemberId: string;
    changes: FieldChanges;
  },
): Promise<void> {
  await db.maintenanceAuditLog.create({
    data: { ...params, changes: params.changes as Prisma.InputJsonValue },
  });
}

/** Recent audit rows for one entity, newest first, with the actor's name. */
export const MAINTENANCE_AUDIT_HISTORY_LIMIT = 10;

export const MAINTENANCE_AUDIT_SELECT = {
  id: true,
  changes: true,
  createdAt: true,
  actor: { select: { id: true, user: { select: { name: true, email: true } } } },
} satisfies Prisma.MaintenanceAuditLogSelect;

export type MaintenanceAuditEntry = Prisma.MaintenanceAuditLogGetPayload<{ select: typeof MAINTENANCE_AUDIT_SELECT }>;
