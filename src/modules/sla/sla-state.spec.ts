import { TicketPriority } from '@prisma/client';

import { SlaPolicyRule, computeTicketSla, matchSlaPolicy, slaTargetState } from './sla-state';

const policy = (overrides: Partial<SlaPolicyRule>): SlaPolicyRule => ({
  id: 'policy',
  name: 'Policy',
  projectId: null,
  priority: TicketPriority.HIGH,
  firstResponseMinutes: 60,
  resolutionMinutes: 480,
  ...overrides,
});

const orgHigh = policy({ id: 'org-high', name: 'Org default HIGH' });
const orgLow = policy({ id: 'org-low', priority: TicketPriority.LOW });
const projectHigh = policy({ id: 'project-high', name: 'Project A HIGH', projectId: 'project-a' });
const projectUrgent = policy({ id: 'project-urgent', projectId: 'project-a', priority: TicketPriority.URGENT });

describe('matchSlaPolicy', () => {
  const policies = [orgHigh, orgLow, projectHigh, projectUrgent];

  it('prefers the policy for the ticket project and priority over the org default', () => {
    expect(matchSlaPolicy(policies, { projectId: 'project-a', priority: TicketPriority.HIGH })).toBe(projectHigh);
    // Same result regardless of the order the policies were loaded in.
    expect(matchSlaPolicy([...policies].reverse(), { projectId: 'project-a', priority: TicketPriority.HIGH })).toBe(projectHigh);
  });

  it('falls back to the org-wide policy for that priority when the project has none', () => {
    expect(matchSlaPolicy(policies, { projectId: 'project-a', priority: TicketPriority.LOW })).toBe(orgLow);
    expect(matchSlaPolicy(policies, { projectId: 'project-b', priority: TicketPriority.HIGH })).toBe(orgHigh);
  });

  it('uses the org-wide policy for a ticket with no project', () => {
    expect(matchSlaPolicy(policies, { projectId: null, priority: TicketPriority.HIGH })).toBe(orgHigh);
  });

  it('never uses another project policy or another priority', () => {
    expect(matchSlaPolicy(policies, { projectId: 'project-b', priority: TicketPriority.URGENT })).toBeNull();
    expect(matchSlaPolicy(policies, { projectId: null, priority: TicketPriority.MEDIUM })).toBeNull();
  });
});

describe('slaTargetState (60-minute window from 09:00, due 10:00)', () => {
  const start = new Date('2026-10-20T09:00:00Z');
  const at = (time: string) => new Date(`2026-10-20T${time}Z`);

  it.each([
    ['ok while more than 20% of the window is left', null, '09:30:00', 'ok'],
    ['at_risk once 20% or less is left', null, '09:48:00', 'at_risk'],
    ['at_risk at the due moment', null, '10:00:00', 'at_risk'],
    ['breached after the due time with no completion', null, '10:00:01', 'breached'],
    ['met when completed on time, even if now is late', '09:59:00', '12:00:00', 'met'],
    ['met when completed exactly at the due time', '10:00:00', '12:00:00', 'met'],
    ['breached when completed late', '10:05:00', '12:00:00', 'breached'],
  ])('%s', (_label, completedAt, now, expected) => {
    const target = slaTargetState(start, 60, completedAt ? at(completedAt) : null, at(now));

    expect(target).toEqual({ dueAt: at('10:00:00'), state: expected });
  });
});

describe('computeTicketSla', () => {
  const createdAt = new Date('2026-10-20T09:00:00Z');
  const ticket = {
    projectId: 'project-a',
    priority: TicketPriority.HIGH,
    createdAt,
    firstRespondedAt: null,
    resolvedAt: null,
  };

  it('measures response and resolution from createdAt with the matched policy', () => {
    const sla = computeTicketSla(
      { ...ticket, firstRespondedAt: new Date('2026-10-20T09:20:00Z') },
      [orgHigh, projectHigh],
      new Date('2026-10-20T16:30:00Z'),
    );

    expect(sla).toEqual({
      policyId: 'project-high',
      policyName: 'Project A HIGH',
      scope: 'project',
      response: { dueAt: new Date('2026-10-20T10:00:00Z'), state: 'met' },
      resolution: { dueAt: new Date('2026-10-20T17:00:00Z'), state: 'at_risk' },
    });
  });

  it('reports the org scope when the default applies', () => {
    const sla = computeTicketSla({ ...ticket, projectId: null }, [orgHigh], new Date('2026-10-20T09:10:00Z'));

    expect(sla).toMatchObject({ policyId: 'org-high', scope: 'organization', response: { state: 'ok' }, resolution: { state: 'ok' } });
  });

  it('is null when no policy applies', () => {
    expect(computeTicketSla({ ...ticket, priority: TicketPriority.MEDIUM }, [orgHigh, projectHigh])).toBeNull();
  });
});
