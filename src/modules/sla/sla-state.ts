import { Prisma, TicketPriority } from '@prisma/client';

/** A target is "at risk" once the time left is at most this share of its full window. */
export const SLA_AT_RISK_FRACTION = 0.2;

export const SLA_STATES = ['ok', 'at_risk', 'breached', 'met'] as const;
export type SlaState = (typeof SLA_STATES)[number];

export type SlaPolicyScope = 'project' | 'organization';

/** Only active, non-archived policies may be passed to the matcher. */
export const ACTIVE_SLA_POLICY_WHERE = { isActive: true, isArchived: false } satisfies Prisma.SlaPolicyWhereInput;

export const SLA_POLICY_RULE_SELECT = {
  id: true,
  name: true,
  projectId: true,
  priority: true,
  firstResponseMinutes: true,
  resolutionMinutes: true,
} satisfies Prisma.SlaPolicySelect;

export type SlaPolicyRule = Prisma.SlaPolicyGetPayload<{ select: typeof SLA_POLICY_RULE_SELECT }>;

export interface SlaTarget {
  dueAt: Date;
  state: SlaState;
}

export interface TicketSla {
  policyId: string;
  policyName: string;
  scope: SlaPolicyScope;
  response: SlaTarget;
  resolution: SlaTarget;
}

export interface SlaTicketFields {
  projectId: string | null;
  priority: TicketPriority;
  createdAt: Date;
  firstRespondedAt: Date | null;
  resolvedAt: Date | null;
}

/**
 * The policy for a ticket: an active policy for its project and priority, else an
 * active org-wide policy (projectId null) for that priority, else none.
 */
export function matchSlaPolicy(
  policies: SlaPolicyRule[],
  ticket: Pick<SlaTicketFields, 'projectId' | 'priority'>,
): SlaPolicyRule | null {
  const forPriority = policies.filter((policy) => policy.priority === ticket.priority);
  const projectPolicy = ticket.projectId
    ? forPriority.find((policy) => policy.projectId === ticket.projectId)
    : undefined;
  return projectPolicy ?? forPriority.find((policy) => policy.projectId === null) ?? null;
}

/**
 * State of one SLA target measured from `startedAt`.
 * TODO: honour SlaPolicy.businessHoursOnly; this uses calendar time only for now.
 */
export function slaTargetState(startedAt: Date, minutes: number, completedAt: Date | null, now: Date): SlaTarget {
  const windowMs = minutes * 60_000;
  const dueAt = new Date(startedAt.getTime() + windowMs);

  if (completedAt) {
    return { dueAt, state: completedAt.getTime() <= dueAt.getTime() ? 'met' : 'breached' };
  }

  const remainingMs = dueAt.getTime() - now.getTime();
  if (remainingMs < 0) return { dueAt, state: 'breached' };
  return { dueAt, state: remainingMs <= windowMs * SLA_AT_RISK_FRACTION ? 'at_risk' : 'ok' };
}

/** SLA for a ticket, calculated on read (nothing is stored). null when no policy applies. */
export function computeTicketSla(
  ticket: SlaTicketFields,
  policies: SlaPolicyRule[],
  now: Date = new Date(),
): TicketSla | null {
  const policy = matchSlaPolicy(policies, ticket);
  if (!policy) return null;

  return {
    policyId: policy.id,
    policyName: policy.name,
    scope: policy.projectId ? 'project' : 'organization',
    response: slaTargetState(ticket.createdAt, policy.firstResponseMinutes, ticket.firstRespondedAt, now),
    resolution: slaTargetState(ticket.createdAt, policy.resolutionMinutes, ticket.resolvedAt, now),
  };
}
