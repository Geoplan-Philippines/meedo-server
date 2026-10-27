import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';
import { TicketDepartmentAccessService } from './access/ticket-department-access.service';
import { TicketActivityService } from './activity/ticket-activity.service';
import { TicketCommentsService } from './comments/ticket-comments.service';
import { TicketsService } from './tickets.service';

type Row = Record<string, unknown>;
type Query = { where?: unknown; include?: unknown; select?: unknown; data?: unknown; by?: string[] };
const object = (value: unknown): Row => value !== null && typeof value === 'object' ? value as Row : {};

describe('Ticket department access across service surfaces', () => {
  let tickets: Row[];
  let comments: Row[];
  let activities: Row[];
  let memberships: Map<string, { id: string; role: string }>;
  let teams: Map<string, string[]>;
  let access: TicketDepartmentAccessService;
  let service: TicketsService;
  let thread: TicketCommentsService;
  let timeline: TicketActivityService;
  let db: ReturnType<typeof database>;
  const page = { page: 1, limit: 20 };

  // A small query interpreter, independent of the access helper, lets tests
  // exercise the real services against multiple departments without a database.
  function matches(row: Row, input: unknown): boolean {
    return Object.entries(object(input)).every(([key, value]) => {
      if (value === undefined) return true;
      if (key === 'AND') return (Array.isArray(value) ? value : [value]).every(v => matches(row, v));
      if (key === 'OR') return Array.isArray(value) && value.some(v => matches(row, v));
      if (key === 'ticket') return tickets.some(t => t.id === row.ticketId && matches(t, value));
      if (key === 'relatedTicket') return tickets.some(t => t.id === row.relatedTicketId && matches(t, value));
      const filter = object(value);
      if ('in' in filter) return Array.isArray(filter.in) && filter.in.includes(row[key]);
      if ('lt' in filter) return row[key] instanceof Date && row[key] < (filter.lt as Date);
      if ('is' in filter) return matches(object(row[key]), filter.is);
      return row[key] === value;
    });
  }

  function hydrate(row: Row, include: unknown): Row {
    if (!('relatedTickets' in object(include))) return { ...row };
    const relation = object(object(include).relatedTickets);
    return { ...row, relatedTickets: tickets
      .filter(t => t.id !== row.id && matches(t, object(relation.where).relatedTicket))
      .map(relatedTicket => ({ relatedTicket })) };
  }

  function database() {
    return {
      member: {
        findUnique: jest.fn(({ where }: { where: { organizationId_userId: { organizationId: string; userId: string } } }) =>
          where.organizationId_userId.organizationId === 'org' ? memberships.get(where.organizationId_userId.userId) ?? null : null),
        count: jest.fn(() => 0),
      },
      teamMember: { findMany: jest.fn(({ where }: { where: { userId: string; team: { organizationId: string } } }) =>
        where.team.organizationId === 'org' ? (teams.get(where.userId) ?? []).map(teamId => ({ teamId })) : []) },
      tickets: {
        findFirst: jest.fn((args: Query) => {
          const row = tickets.find(t => matches(t, args.where));
          return row ? hydrate(row, args.include) : null;
        }),
        findMany: jest.fn((args: Query) => tickets.filter(t => matches(t, args.where)).map(t => hydrate(t, args.include))),
        count: jest.fn((args: Query) => tickets.filter(t => matches(t, args.where)).length),
        groupBy: jest.fn((args: Query) => {
          const field = args.by?.[0] ?? 'priority';
          const groups = new Map<unknown, number>();
          tickets.filter(t => matches(t, args.where)).forEach(t => groups.set(t[field], (groups.get(t[field]) ?? 0) + 1));
          return [...groups].map(([key, count]) => ({ [field]: key, _count: { _all: count } }));
        }),
        create: jest.fn((args: Query) => {
          const data = object(args.data);
          const teamId = object(object(data.team).connect).id;
          const row = { ...ticket('created', typeof teamId === 'string' ? teamId : null), ...data,
            organizationId: object(object(data.organization).connect).id,
            teamId: object(object(data.team).connect).id ?? null };
          tickets.push(row);
          return hydrate(row, args.include);
        }),
        update: jest.fn((args: Query) => {
          const row = tickets.find(t => matches(t, args.where));
          if (!row) throw new NotFoundException();
          Object.assign(row, object(args.data));
          return row;
        }),
        findUniqueOrThrow: jest.fn((args: Query) => {
          const row = tickets.find(t => matches(t, args.where));
          if (!row) throw new NotFoundException();
          return hydrate(row, args.include);
        }),
      },
      ticketComment: {
        findMany: jest.fn((args: Query) => comments.filter(c => matches(c, args.where)).map(c => ({ ...c,
          replies: comments.filter(r => r.parentId === c.id && matches(r, object(object(args.include).replies).where)) }))),
        count: jest.fn((args: Query) => comments.filter(c => matches(c, args.where)).length),
        findFirst: jest.fn((args: Query) => comments.find(c => matches(c, args.where)) ?? null),
        create: jest.fn((args: Query) => {
          const row = { id: `comment-${comments.length}`, ...object(args.data) };
          comments.push(row); return row;
        }),
        update: jest.fn((args: Query) => {
          const row = comments.find(c => matches(c, args.where));
          if (!row) throw new NotFoundException();
          Object.assign(row, object(args.data)); return row;
        }),
        delete: jest.fn((args: Query) => { comments = comments.filter(c => !matches(c, args.where)); }),
      },
      ticketActivity: {
        findMany: jest.fn((args: Query) => activities.filter(a => matches(a, args.where))),
        count: jest.fn((args: Query) => activities.filter(a => matches(a, args.where)).length),
        create: jest.fn((args: Query) => { activities.push(object(args.data)); }),
        deleteMany: jest.fn(),
      },
      team: { findFirst: jest.fn(() => ({ id: 'a' })) },
      ticketRelation: { findMany: jest.fn(() => []), createMany: jest.fn(), deleteMany: jest.fn() },
      slaPolicy: { findMany: jest.fn(() => []) },
      $transaction: jest.fn<Promise<unknown>, [(client: unknown) => unknown]>(),
    };
  }

  function ticket(id: string, teamId: string | null, organizationId = 'org'): Row {
    return { id, teamId, organizationId, title: id, ticketNumber: 123456, priority: 'HIGH',
      projectId: null, ticketStatusId: null, categoryId: null, isArchived: false, assignees: [],
      resolvedAt: null, firstRespondedAt: null, dueDate: new Date('2000-01-01') };
  }

  beforeEach(() => {
    tickets = [ticket('a-ticket', 'a'), ticket('b-ticket', 'b'), ticket('no-team', null), ticket('foreign', 'a', 'foreign-org')];
    comments = [{ id: 'comment', ticketId: 'a-ticket', parentId: null, authorMemberId: 'member-u', body: 'Original' },
      { id: 'reply', ticketId: 'a-ticket', parentId: 'comment', authorMemberId: 'member-u', body: 'Reply' },
      { id: 'foreign-comment', ticketId: 'b-ticket', parentId: null, authorMemberId: 'member-u' }];
    activities = [{ ticketId: 'a-ticket' }, { ticketId: 'b-ticket' }];
    memberships = new Map(['u', 'multi', 'empty', 'admin', 'owner'].map(user =>
      [user, { id: `member-${user}`, role: user === 'admin' || user === 'owner' ? user : 'member' }]));
    teams = new Map([['u', ['a']], ['multi', ['a', 'b']], ['empty', []]]);
    db = database();
    db.$transaction.mockImplementation(fn => Promise.resolve(fn(db)));
    const prisma = db as unknown as PrismaService;
    access = new TicketDepartmentAccessService(prisma);
    timeline = new TicketActivityService(prisma, access);
    service = new TicketsService(prisma, timeline, access);
    thread = new TicketCommentsService(prisma, timeline, access);
  });

  const surfaces = ['list', 'stats', 'facets', 'detail', 'comments', 'activity', 'create', 'update', 'add-comment', 'edit-comment', 'delete-comment'] as const;
  function request(surface: typeof surfaces[number], organizationId: string, userId?: string) {
    switch (surface) {
      case 'list': return service.getAllTickets(page, organizationId, userId);
      case 'stats': return service.getTicketStats(organizationId, userId);
      case 'facets': return service.getFacets({}, organizationId, userId);
      case 'detail': return service.getTicketById('a-ticket', organizationId, userId);
      case 'comments': return thread.getComments('a-ticket', organizationId, userId, page);
      case 'activity': return timeline.getActivity('a-ticket', organizationId, page, userId);
      case 'create': return service.createTicket({ title: 'New', teamId: 'a' }, organizationId, userId);
      case 'update': return service.updateTicket('a-ticket', { title: 'Updated' }, organizationId, userId);
      case 'add-comment': return thread.addComment('a-ticket', organizationId, userId, { body: 'New' });
      case 'edit-comment': return thread.updateComment('comment', 'a-ticket', organizationId, userId, { body: 'Edit' });
      case 'delete-comment': return thread.deleteComment('comment', 'a-ticket', organizationId, userId);
    }
  }

  it.each(surfaces)('%s denies missing identity, missing organization and removed membership with 403', async surface => {
    await expect(request(surface, 'org')).rejects.toBeInstanceOf(ForbiddenException);
    await expect(request(surface, '', 'u')).rejects.toBeInstanceOf(ForbiddenException);
    memberships.delete('u');
    await expect(request(surface, 'org', 'u')).rejects.toBeInstanceOf(ForbiddenException);
    expect(db.tickets.create).not.toHaveBeenCalled();
    expect(db.tickets.update).not.toHaveBeenCalled();
    expect(db.ticketComment.create).not.toHaveBeenCalled();
    expect(db.ticketActivity.create).not.toHaveBeenCalled();
  });

  it.each<[string, string[]]>([['u', ['a-ticket']], ['multi', ['a-ticket', 'b-ticket']], ['empty', []],
    ['admin', ['a-ticket', 'b-ticket', 'no-team']], ['owner', ['a-ticket', 'b-ticket', 'no-team']]])(
    '%s list, totals, stats and every facet agree', async (userId, expected) => {
      const list = await service.getAllTickets(page, 'org', userId);
      const stats = await service.getTicketStats('org', userId);
      const facets = await service.getFacets({}, 'org', userId);
      expect(list.data.map(t => t.id)).toEqual(expected);
      expect(list.meta.total).toBe(expected.length);
      expect(stats).toEqual({ total: expected.length, urgent: 0, high: expected.length, overdue: expected.length });
      expect(facets.views).toEqual({ all: expected.length, active: 0, backlog: 0, closed: 0 });
      expect(facets.noStatusCount).toBe(expected.length);
      expect(facets.priorities.reduce((sum, p) => sum + p.count, 0)).toBe(expected.length);
      if (userId === 'admin' || userId === 'owner') expect(db.teamMember.findMany).not.toHaveBeenCalled();
    });

  it('intersects forged filters instead of widening access and shares list/facet scope', async () => {
    for (const teamId of [['b'], ['a', 'b']]) {
      const list = await service.getAllTickets({ ...page, teamId }, 'org', 'u');
      const facets = await service.getFacets({ teamId }, 'org', 'u');
      expect(list.data.map(t => t.id)).toEqual(teamId.includes('a') ? ['a-ticket'] : []);
      expect(facets.views.all).toBe(list.meta.total);
    }
  });

  it('scopes nonempty status groups and board views as well as priority groups', async () => {
    Object.assign(tickets[0], { ticketStatusId: 'open', ticketStatus: { category: 'STARTED' } });
    Object.assign(tickets[1], { ticketStatusId: 'backlog', ticketStatus: { category: 'BACKLOG' }, priority: 'URGENT' });
    const list = await service.getAllTickets({ ...page, view: 'active' }, 'org', 'u');
    const facets = await service.getFacets({ view: 'active' }, 'org', 'u');
    expect(list.meta.total).toBe(1);
    expect(facets.views).toEqual({ all: 1, active: 1, backlog: 0, closed: 0 });
    expect(facets.statuses).toEqual([{ ticketStatusId: 'open', count: 1 }]);
    expect(facets.priorities).toEqual([{ priority: 'HIGH', count: 1 }]);
    expect(facets.noStatusCount).toBe(0);
  });

  it.each(['b-ticket', 'no-team', 'foreign'])('hides %s on detail, comments, activity and mutation targets', async id => {
    await expect(service.getTicketById(id, 'org', 'u')).rejects.toBeInstanceOf(NotFoundException);
    await expect(thread.getComments(id, 'org', 'u', page)).rejects.toBeInstanceOf(NotFoundException);
    await expect(timeline.getActivity(id, 'org', page, 'u')).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.updateTicket(id, { title: 'Forbidden' }, 'org', 'u')).rejects.toBeInstanceOf(NotFoundException);
    await expect(thread.addComment(id, 'org', 'u', { body: 'Forbidden' })).rejects.toBeInstanceOf(NotFoundException);
    expect(db.tickets.update).not.toHaveBeenCalled();
    expect(db.ticketComment.create).not.toHaveBeenCalled();
  });

  it('omits inaccessible related summaries from detail and PATCH responses', async () => {
    const detail = await service.getTicketById('a-ticket', 'org', 'u');
    const updated = await service.updateTicket('a-ticket', { title: 'Allowed' }, 'org', 'u');
    expect(detail.relatedTickets).toEqual([]);
    expect(updated.relatedTickets).toEqual([]);
    const admin = await service.getTicketById('a-ticket', 'org', 'admin');
    expect(admin.relatedTickets.map(t => t.id)).toEqual(['b-ticket', 'no-team']);
  });

  it('requires a permitted create team and keeps list/POST free of related summaries', async () => {
    for (const teamId of [undefined, 'b']) {
      await expect(service.createTicket({ title: 'Denied', teamId }, 'org', 'u')).rejects.toBeInstanceOf(ForbiddenException);
    }
    expect(db.tickets.create).not.toHaveBeenCalled();
    const created = await service.createTicket({ title: 'Allowed', teamId: 'a' }, 'org', 'u');
    expect(created.teamId).toBe('a');
    expect(db.tickets.create.mock.calls[0][0].include).not.toHaveProperty('relatedTickets');
    await service.getAllTickets(page, 'org', 'u');
    expect(db.tickets.findMany.mock.calls[0][0].include).not.toHaveProperty('relatedTickets');
  });

  it('blocks member moves/clears, permits a move within the union, and resolves once inside the write transaction', async () => {
    await expect(service.updateTicket('a-ticket', { teamId: 'b' }, 'org', 'u')).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.updateTicket('a-ticket', { teamId: null } as never, 'org', 'u')).rejects.toBeInstanceOf(ForbiddenException);
    expect(db.tickets.update).not.toHaveBeenCalled();
    db.member.findUnique.mockClear();
    db.teamMember.findMany.mockClear();
    const result = await service.updateTicket('a-ticket', { teamId: 'b' }, 'org', 'multi');
    expect(result.teamId).toBe('b');
    expect(db.member.findUnique).toHaveBeenCalledTimes(1);
    expect(db.teamMember.findMany).toHaveBeenCalledTimes(1);
    expect(db.$transaction.mock.invocationCallOrder[2]).toBeLessThan(db.member.findUnique.mock.invocationCallOrder[0]);
  });

  it.each(['admin', 'owner'])('%s can create without a team and clear or change a team', async userId => {
    expect((await service.createTicket({ title: 'Admin ticket' }, 'org', userId)).teamId).toBeNull();
    expect((await service.updateTicket('a-ticket', { teamId: null } as never, 'org', userId)).teamId).toBeNull();
    expect((await service.updateTicket('a-ticket', { teamId: 'b' }, 'org', userId)).teamId).toBe('b');
  });

  it('rejects linking hidden targets before writing and preserves hidden existing relations', async () => {
    await expect(service.updateTicket('a-ticket', { relatedTicketIds: ['b-ticket'] }, 'org', 'u')).rejects.toBeInstanceOf(NotFoundException);
    expect(db.tickets.update).not.toHaveBeenCalled();
    expect(db.ticketRelation.createMany).not.toHaveBeenCalled();
    await service.updateTicket('a-ticket', { relatedTicketIds: [] }, 'org', 'u');
    expect(db.ticketRelation.findMany.mock.calls[0][0].where).toEqual({
      ticketId: 'a-ticket', relatedTicket: access.where(await access.resolve('org', 'u')),
    });
  });

  it('scopes comment rows, counts, replies and activity rows while preserving author permissions', async () => {
    const result = await thread.getComments('a-ticket', 'org', 'u', page);
    expect(result.meta.total).toBe(1);
    expect(result.data[0].canModify).toBe(true);
    expect(result.data[0].replies).toHaveLength(1);
    expect((await timeline.getActivity('a-ticket', 'org', page, 'u')).meta.total).toBe(1);
    await thread.addComment('a-ticket', 'org', 'u', { body: 'Reply', parentId: 'comment' });
    expect(object(db.ticketComment.create.mock.calls[0][0].data).parentId).toBe('comment');
    await expect(thread.addComment('a-ticket', 'org', 'u', { body: 'Wrong parent', parentId: 'foreign-comment' })).rejects.toBeInstanceOf(NotFoundException);
    await thread.updateComment('comment', 'a-ticket', 'org', 'u', { body: 'Updated' });
    await thread.deleteComment('comment', 'a-ticket', 'org', 'u');
    expect(db.ticketComment.update).toHaveBeenCalledTimes(1);
    expect(db.ticketComment.delete).toHaveBeenCalledTimes(1);
  });

  it('keeps author/admin comment restrictions inside an accessible department', async () => {
    await expect(thread.updateComment('comment', 'a-ticket', 'org', 'multi', { body: 'Not mine' })).rejects.toBeInstanceOf(ForbiddenException);
    await expect(thread.deleteComment('comment', 'a-ticket', 'org', 'multi')).rejects.toBeInstanceOf(ForbiddenException);
    await thread.updateComment('comment', 'a-ticket', 'org', 'admin', { body: 'Admin' });
    await thread.deleteComment('comment', 'a-ticket', 'org', 'owner');
  });

  it('revokes access immediately, including an authors own comment edits/deletions, without caching', async () => {
    expect((await service.getAllTickets(page, 'org', 'u')).meta.total).toBe(1);
    teams.set('u', []);
    expect((await service.getAllTickets(page, 'org', 'u')).meta.total).toBe(0);
    await expect(thread.updateComment('comment', 'a-ticket', 'org', 'u', { body: 'Old author' })).rejects.toBeInstanceOf(NotFoundException);
    await expect(thread.deleteComment('comment', 'a-ticket', 'org', 'u')).rejects.toBeInstanceOf(NotFoundException);
    expect(db.ticketComment.update).not.toHaveBeenCalled();
    expect(db.ticketComment.delete).not.toHaveBeenCalled();
    teams.set('u', ['b']);
    expect((await service.getAllTickets(page, 'org', 'u')).data.map(t => t.id)).toEqual(['b-ticket']);
  });

  it('provides parameterized raw SQL, including a deny-all empty scope, without executing it', async () => {
    const member = access.sql(await access.resolve('org', 'u'));
    expect(member.values).toEqual(['org', 'a']);
    expect(member.text).not.toContain("'org'");
    expect(access.sql(await access.resolve('org', 'empty')).text).toContain('FALSE');
    expect(access.sql(await access.resolve('org', 'admin')).values).toEqual(['org']);
  });
});
