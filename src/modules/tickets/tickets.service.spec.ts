import { NotificationsService } from '../notifications/notifications.service';
import { BadRequestException, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Prisma } from '@prisma/client';

import { TicketsService } from './tickets.service';
import { PrismaService } from '../../core/database/prisma.service';
import { TicketActivityService } from './activity/ticket-activity.service';
import { TicketDepartmentAccessService } from './access/ticket-department-access.service';
import { TICKET_NUMBER_MAX, TICKET_NUMBER_MIN, MAX_TICKET_NUMBER_RETRIES } from './constants/ticket.constants';

const mockTicket = {
  id: '111222333',
  ticketNumber: 123456,
  title: 'Test Ticket',
  description: null,
  priority: 'MEDIUM' as const,
  isArchived: false,
  organizationId: 'org-uuid-1',
  teamId: null,
  projectId: null,
  categoryId: null,
  ticketStatusId: null,
  firstRespondedAt: null,
  resolvedAt: null,
  dueDate: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  ticketStatus: null,
  category: null,
  project: null,
  team: null,
  assignees: [],
  relatedTickets: [],
};

const mockPrismaService = {
  tickets: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    count: jest.fn(),
    groupBy: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    findUniqueOrThrow: jest.fn(),
  },
  ticketStatus: {
    findFirst: jest.fn(),
  },
  ticketCategory: {
    findFirst: jest.fn(),
  },
  team: {
    findFirst: jest.fn(),
  },
  member: {
    count: jest.fn(),
  },
  project: {
    findFirst: jest.fn(),
  },
  ticketAssignee: {
    deleteMany: jest.fn(),
    createMany: jest.fn(),
  },
  slaPolicy: {
    findMany: jest.fn(),
  },
  $transaction: jest.fn(),
};

const mockActivityService = {
  resolveMemberId: jest.fn(),
  record: jest.fn(),
};

// Existing business-rule cases exercise an authorized administrator. The access
// matrix is tested with real membership resolution in tickets-department.spec.ts.
const access = new TicketDepartmentAccessService(mockPrismaService as unknown as PrismaService);
const resolveScope = jest.spyOn(access, 'resolve');

describe('TicketsService', () => {
  let service: TicketsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [{ provide: NotificationsService, useValue: { ticketEvent: jest.fn() } },
        TicketsService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: TicketActivityService, useValue: mockActivityService },
        { provide: TicketDepartmentAccessService, useValue: access },
      ],
    }).compile();

    service = module.get<TicketsService>(TicketsService);
    jest.resetAllMocks();
    resolveScope.mockResolvedValue({ organizationId: 'org-uuid-1', userId: 'admin-user',
      memberId: 'admin-member', role: 'admin', isAdmin: true, teamIds: [] });
    mockPrismaService.$transaction.mockImplementation((fn: Function) => fn(mockPrismaService));
    mockActivityService.resolveMemberId.mockResolvedValue(undefined);
    mockActivityService.record.mockResolvedValue(undefined);
    mockPrismaService.slaPolicy.findMany.mockResolvedValue([]);
  });

  describe('createTicket', () => {
    const dto = {
      title: 'Test Ticket',
      priority: 'MEDIUM' as const,
    };

    /** Ticket creation runs inside `prisma.$transaction`; this mocks the tx client
     *  and hands back the capturing `create` mock so assertions can inspect it. */
    const mockCreateTransaction = (create: jest.Mock) => {
      mockPrismaService.$transaction.mockImplementation(async (fn: Function) => fn({ tickets: { create } }));
    };

    it('creates and returns a ticket', async () => {
      const create = jest.fn().mockResolvedValue(mockTicket);
      mockCreateTransaction(create);

      const result = await service.createTicket(dto, 'org-uuid-1');

      expect(create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            title: dto.title,
            priority: dto.priority,
            organization: { connect: { id: 'org-uuid-1' } },
          }),
        }),
      );
      expect(result).toEqual({ ...mockTicket, sla: null });
    });

    it('deduplicates assigneeIds before creating', async () => {
      mockPrismaService.member.count.mockResolvedValue(1);
      const create = jest.fn().mockResolvedValue(mockTicket);
      mockCreateTransaction(create);

      await service.createTicket(
        { ...dto, assigneeIds: ['member-1', 'member-1'] },
        'org-uuid-1',
      );

      const createCall = create.mock.calls[0][0];
      const assigneeData = createCall.data.assignees.createMany.data;
      expect(assigneeData).toHaveLength(1);
    });

    it('retries on ticket number collision and eventually succeeds', async () => {
      const collisionError = new Prisma.PrismaClientKnownRequestError('collision', {
        code: 'P2002',
        clientVersion: '5.0.0',
        meta: { target: ['ticket_number'] },
      });

      mockPrismaService.$transaction
        .mockRejectedValueOnce(collisionError)
        .mockImplementationOnce(async (fn: Function) =>
          fn({ tickets: { create: jest.fn().mockResolvedValue(mockTicket) } }),
        );

      const result = await service.createTicket(dto, 'org-uuid-1');

      expect(mockPrismaService.$transaction).toHaveBeenCalledTimes(2);
      expect(result).toEqual({ ...mockTicket, sla: null });
    });

    it('throws InternalServerErrorException after max retries', async () => {
      const collisionError = new Prisma.PrismaClientKnownRequestError('collision', {
        code: 'P2002',
        clientVersion: '5.0.0',
        meta: { target: ['ticket_number'] },
      });

      mockPrismaService.$transaction.mockRejectedValue(collisionError);

      await expect(service.createTicket(dto, 'org-uuid-1')).rejects.toThrow(
        InternalServerErrorException,
      );

      expect(mockPrismaService.$transaction).toHaveBeenCalledTimes(MAX_TICKET_NUMBER_RETRIES);
    });

    it('throws NotFoundException when ticketStatusId is invalid', async () => {
      mockPrismaService.ticketStatus.findFirst.mockResolvedValue(null);

      await expect(
        service.createTicket({ ...dto, ticketStatusId: 'bad-id' }, 'org-uuid-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException when categoryId is invalid', async () => {
      mockPrismaService.ticketCategory.findFirst.mockResolvedValue(null);

      await expect(
        service.createTicket({ ...dto, categoryId: 'bad-id' }, 'org-uuid-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException when teamId is invalid', async () => {
      mockPrismaService.team.findFirst.mockResolvedValue(null);

      await expect(
        service.createTicket({ ...dto, teamId: 'bad-id' }, 'org-uuid-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException when projectId is invalid', async () => {
      mockPrismaService.project.findFirst.mockResolvedValue(null);

      await expect(
        service.createTicket({ ...dto, projectId: 'bad-id' }, 'org-uuid-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException when one or more assigneeIds are invalid', async () => {
      mockPrismaService.member.count.mockResolvedValue(0);

      await expect(
        service.createTicket({ ...dto, assigneeIds: ['bad-member-id'] }, 'org-uuid-1'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('getAllTickets', () => {
    it('filters no-status tickets and orders board pages by priority then update time', async () => {
      mockPrismaService.tickets.findMany.mockResolvedValue([]);
      mockPrismaService.tickets.count.mockResolvedValue(0);
      await service.getAllTickets({ page: 2, limit: 20, noStatus: true, sortField: 'board',
        view: 'all', teamId: ['team-1'], assigneeId: 'member-1', search: 'pump', priority: ['HIGH'] }, 'org-uuid-1');
      expect(mockPrismaService.tickets.findMany).toHaveBeenCalledWith(expect.objectContaining({
        skip: 20, take: 20,
        where: expect.objectContaining({ organizationId: 'org-uuid-1', isArchived: false, ticketStatusId: null,
          teamId: { in: ['team-1'] }, priority: { in: ['HIGH'] }, assignees: { some: { memberId: 'member-1' } } }),
        orderBy: [{ priority: 'desc' }, { updatedAt: 'desc' }, { id: 'asc' }],
      }));
    });

    it('returns paginated tickets', async () => {
      mockPrismaService.tickets.findMany.mockResolvedValue([mockTicket]);
      mockPrismaService.tickets.count.mockResolvedValue(1);

      const result = await service.getAllTickets({ page: 1, limit: 10 }, 'org-uuid-1');

      expect(result.data).toEqual([{ ...mockTicket, sla: null }]);
      expect(result.meta.total).toBe(1);
      expect(result.meta.page).toBe(1);
      expect(result.meta.lastPage).toBe(1);
    });

    it('calculates lastPage correctly', async () => {
      mockPrismaService.tickets.findMany.mockResolvedValue([]);
      mockPrismaService.tickets.count.mockResolvedValue(25);

      const result = await service.getAllTickets({ page: 1, limit: 10 }, 'org-uuid-1');

      expect(result.meta.lastPage).toBe(3);
    });

    it('skips correct number of records based on page', async () => {
      mockPrismaService.tickets.findMany.mockResolvedValue([]);
      mockPrismaService.tickets.count.mockResolvedValue(0);

      await service.getAllTickets({ page: 3, limit: 10 }, 'org-uuid-1');

      expect(mockPrismaService.tickets.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 20, take: 10 }),
      );
    });
  });

  describe('updateTicket', () => {
    describe('resolution time', () => {
      beforeEach(() => {
        mockPrismaService.tickets.findUniqueOrThrow.mockResolvedValue(mockTicket);
      });

      it.each(['COMPLETED', 'CANCELED'])('sets resolvedAt on entering %s and records the status activity', async category => {
        mockPrismaService.tickets.findFirst.mockResolvedValue({ ...mockTicket, ticketStatusId: 'open' });
        mockPrismaService.ticketStatus.findFirst.mockResolvedValue({ id: 'terminal', category });
        const before = Date.now();
        await service.updateTicket(mockTicket.id, { ticketStatusId: 'terminal' }, mockTicket.organizationId);
        const data = mockPrismaService.tickets.update.mock.calls[0][0].data;
        expect(data.resolvedAt).toBeInstanceOf(Date);
        expect(data.resolvedAt.getTime()).toBeGreaterThanOrEqual(before);
        expect(mockActivityService.record).toHaveBeenCalledWith(mockPrismaService, expect.objectContaining({
          type: 'STATUS_CHANGED', meta: { from: 'open', to: 'terminal' },
        }));
      });

      it.each(['STARTED', 'BACKLOG'])('clears resolvedAt on moving back out to %s', async category => {
        mockPrismaService.tickets.findFirst.mockResolvedValue({ ...mockTicket, ticketStatusId: 'done', resolvedAt: new Date() });
        mockPrismaService.ticketStatus.findFirst.mockResolvedValue({ id: 'open', category });
        await service.updateTicket(mockTicket.id, { ticketStatusId: 'open' }, mockTicket.organizationId);
        expect(mockPrismaService.tickets.update).toHaveBeenCalledWith(expect.objectContaining({
          data: expect.objectContaining({ resolvedAt: null }),
        }));
      });

      it('preserves resolvedAt between terminal statuses', async () => {
        const resolvedAt = new Date('2026-10-01');
        mockPrismaService.tickets.findFirst.mockResolvedValue({ ...mockTicket, ticketStatusId: 'done', resolvedAt });
        mockPrismaService.ticketStatus.findFirst.mockResolvedValue({ id: 'canceled', category: 'CANCELED' });
        await service.updateTicket(mockTicket.id, { ticketStatusId: 'canceled' }, mockTicket.organizationId);
        expect(mockPrismaService.tickets.update).toHaveBeenCalledWith(expect.objectContaining({
          data: { ticketStatusId: 'canceled', resolvedAt },
        }));
      });

      it('does not change resolvedAt on an unrelated edit or unchanged status', async () => {
        mockPrismaService.tickets.findFirst.mockResolvedValue({ ...mockTicket, ticketStatusId: 'done', resolvedAt: new Date() });
        await service.updateTicket(mockTicket.id, { title: 'Updated' }, mockTicket.organizationId);
        expect(mockPrismaService.tickets.update.mock.calls[0][0].data).toEqual({ title: 'Updated' });
        mockPrismaService.ticketStatus.findFirst.mockResolvedValue({ id: 'done' });
        await service.updateTicket(mockTicket.id, { ticketStatusId: 'done' }, mockTicket.organizationId);
        expect(mockPrismaService.tickets.update.mock.calls[1][0].data).toEqual({ ticketStatusId: 'done' });
      });
    });
    const existingTicket = {
      id: 'ticket-uuid-1',
      ticketStatusId: null,
      priority: 'MEDIUM' as const,
      assignees: [],
    };

    it('throws NotFoundException when the ticket is missing or in another org', async () => {
      mockPrismaService.tickets.findFirst.mockResolvedValue(null);

      await expect(
        service.updateTicket('missing-id', { title: 'Updated' }, 'org-uuid-1'),
      ).rejects.toThrow(NotFoundException);

      expect(mockPrismaService.tickets.update).not.toHaveBeenCalled();
    });

    it('updates ticket and syncs assignees in a transaction', async () => {
      mockPrismaService.tickets.findFirst.mockResolvedValue(existingTicket);
      mockPrismaService.member.count.mockResolvedValue(1);

      mockPrismaService.$transaction.mockImplementation(async (fn: Function) => {
        return fn({
          tickets: {
            findFirst: mockPrismaService.tickets.findFirst,
            update: jest.fn(),
            findUniqueOrThrow: jest.fn().mockResolvedValue(mockTicket),
          },
          ticketAssignee: {
            deleteMany: jest.fn(),
            createMany: jest.fn(),
          },
        });
      });

      const result = await service.updateTicket(
        'ticket-uuid-1',
        { title: 'Updated', assigneeIds: ['member-1'] },
        'org-uuid-1',
      );

      expect(mockPrismaService.$transaction).toHaveBeenCalled();
      expect(result).toEqual({ ...mockTicket, sla: null });
    });

    it('does not touch assignees when assigneeIds is undefined', async () => {
      mockPrismaService.tickets.findFirst.mockResolvedValue(existingTicket);
      const deleteMany = jest.fn();
      mockPrismaService.$transaction.mockImplementation(async (fn: Function) => {
        return fn({
          tickets: {
            findFirst: mockPrismaService.tickets.findFirst,
            update: jest.fn(),
            findUniqueOrThrow: jest.fn().mockResolvedValue(mockTicket),
          },
          ticketAssignee: { deleteMany },
        });
      });

      await service.updateTicket('ticket-uuid-1', { title: 'Updated' }, 'org-uuid-1');

      expect(deleteMany).not.toHaveBeenCalled();
    });

    it('mirrors both directions when relatedTicketIds is provided', async () => {
      mockPrismaService.tickets.findFirst.mockResolvedValue(existingTicket);
      mockPrismaService.tickets.count.mockResolvedValue(1); // the related ticket exists in the org

      const relationCreateMany = jest.fn();
      mockPrismaService.$transaction.mockImplementation(async (fn: Function) => {
        return fn({
          tickets: {
            findFirst: mockPrismaService.tickets.findFirst,
            count: mockPrismaService.tickets.count,
            update: jest.fn(),
            findUniqueOrThrow: jest.fn().mockResolvedValue(mockTicket),
          },
          ticketAssignee: { deleteMany: jest.fn(), createMany: jest.fn() },
          ticketRelation: {
            findMany: jest.fn().mockResolvedValue([]),
            deleteMany: jest.fn(),
            createMany: relationCreateMany,
          },
        });
      });

      await service.updateTicket(
        'ticket-uuid-1',
        { relatedTicketIds: ['ticket-uuid-2'] },
        'org-uuid-1',
      );

      expect(relationCreateMany).toHaveBeenCalledWith({
        data: [
          { ticketId: 'ticket-uuid-1', relatedTicketId: 'ticket-uuid-2' },
          { ticketId: 'ticket-uuid-2', relatedTicketId: 'ticket-uuid-1' },
        ],
        skipDuplicates: true,
      });
    });

    it('rejects relating a ticket to itself', async () => {
      mockPrismaService.tickets.findFirst.mockResolvedValue(existingTicket);

      await expect(
        service.updateTicket('ticket-uuid-1', { relatedTicketIds: ['ticket-uuid-1'] }, 'org-uuid-1'),
      ).rejects.toThrow(BadRequestException);

      expect(mockPrismaService.tickets.update).not.toHaveBeenCalled();
    });
  });

  describe('getFacets', () => {
    it('scopes board column counts by priority without changing priority-option counts', async () => {
      mockPrismaService.tickets.count.mockResolvedValue(0);
      mockPrismaService.tickets.groupBy.mockResolvedValue([]);
      await service.getFacets({ priority: ['HIGH'] }, 'org-uuid-1');
      expect(mockPrismaService.tickets.groupBy).toHaveBeenCalledWith({ by: ['ticketStatusId'],
        where: { organizationId: 'org-uuid-1', isArchived: false, priority: { in: ['HIGH'] } }, _count: { _all: true } });
      expect(mockPrismaService.tickets.groupBy).toHaveBeenCalledWith({ by: ['priority'],
        where: { organizationId: 'org-uuid-1', isArchived: false }, _count: { _all: true } });
    });
    it('scopes every count by team/category/assignee so badges match the list', async () => {
      mockPrismaService.tickets.count.mockResolvedValue(0);
      mockPrismaService.tickets.groupBy.mockResolvedValue([]);

      await service.getFacets(
        { teamId: ['team-1'], categoryId: 'cat-1', assigneeId: 'mem-1' },
        'org-uuid-1',
      );

      const expectedScope = {
        organizationId: 'org-uuid-1',
        isArchived: false,
        teamId: { in: ['team-1'] },
        categoryId: 'cat-1',
        assignees: { some: { memberId: 'mem-1' } },
      };
      // The "all" view count uses the bare context (no view constraint).
      expect(mockPrismaService.tickets.count).toHaveBeenCalledWith({ where: expectedScope });
      // Status/priority groupings inherit the same scope (view undefined here).
      expect(mockPrismaService.tickets.groupBy).toHaveBeenCalledWith({
        by: ['ticketStatusId'],
        where: expectedScope,
        _count: { _all: true },
      });
      expect(mockPrismaService.tickets.groupBy).toHaveBeenCalledWith({
        by: ['priority'],
        where: expectedScope,
        _count: { _all: true },
      });
    });

    it('shapes view/status/priority counts and drops the null-status group', async () => {
      // Promise.all order: backlog, active, closed, all.
      mockPrismaService.tickets.count
        .mockResolvedValueOnce(1)
        .mockResolvedValueOnce(2)
        .mockResolvedValueOnce(3)
        .mockResolvedValueOnce(10);
      mockPrismaService.tickets.groupBy
        .mockResolvedValueOnce([
          { ticketStatusId: 'st-1', _count: { _all: 3 } },
          { ticketStatusId: null, _count: { _all: 2 } },
        ])
        .mockResolvedValueOnce([{ priority: 'HIGH', _count: { _all: 4 } }]);

      const result = await service.getFacets({}, 'org-uuid-1');

      expect(result).toEqual({
        noStatusCount: 2,
        views: { backlog: 1, active: 2, closed: 3, all: 10 },
        statuses: [{ ticketStatusId: 'st-1', count: 3 }],
        priorities: [{ priority: 'HIGH', count: 4 }],
      });
    });
  });

  describe('project filter', () => {
    it('narrows the list and every facet count to one project', async () => {
      mockPrismaService.tickets.findMany.mockResolvedValue([]);
      mockPrismaService.tickets.count.mockResolvedValue(0);
      mockPrismaService.tickets.groupBy.mockResolvedValue([]);

      await service.getAllTickets({ page: 1, limit: 10, projectId: 'project-1' }, 'org-uuid-1');
      await service.getFacets({ projectId: 'project-1' }, 'org-uuid-1');

      expect(mockPrismaService.tickets.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ projectId: 'project-1' }) }),
      );
      for (const [args] of [...mockPrismaService.tickets.count.mock.calls, ...mockPrismaService.tickets.groupBy.mock.calls]) {
        expect(args.where).toMatchObject({ projectId: 'project-1' });
      }
    });
  });

  describe('archived projects', () => {
    const ARCHIVED_PROJECT = 'project-archived';

    beforeEach(() => {
      mockPrismaService.project.findFirst.mockResolvedValue({ id: ARCHIVED_PROJECT, isArchived: true });
      mockPrismaService.tickets.findUniqueOrThrow.mockResolvedValue(mockTicket);
    });

    it('rejects creating a ticket on an archived project with 400', async () => {
      const create = jest.fn();
      mockPrismaService.$transaction.mockImplementation(async (fn: Function) => fn({ tickets: { create } }));

      await expect(
        service.createTicket({ title: 'New', projectId: ARCHIVED_PROJECT }, 'org-uuid-1'),
      ).rejects.toThrow(BadRequestException);
      expect(create).not.toHaveBeenCalled();
    });

    it('rejects moving a ticket onto an archived project with 400', async () => {
      mockPrismaService.tickets.findFirst.mockResolvedValue({ ...mockTicket, projectId: 'project-active' });

      await expect(
        service.updateTicket(mockTicket.id, { projectId: ARCHIVED_PROJECT }, 'org-uuid-1'),
      ).rejects.toThrow(BadRequestException);
      expect(mockPrismaService.tickets.update).not.toHaveBeenCalled();
    });

    it('still saves a ticket already on an archived project when the project is unchanged', async () => {
      mockPrismaService.tickets.findFirst.mockResolvedValue({ ...mockTicket, projectId: ARCHIVED_PROJECT });

      await service.updateTicket(mockTicket.id, { title: 'Renamed', projectId: ARCHIVED_PROJECT }, 'org-uuid-1');

      expect(mockPrismaService.tickets.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ title: 'Renamed', projectId: ARCHIVED_PROJECT }) }),
      );
    });

    it('returns 404 for a project outside the organization', async () => {
      mockPrismaService.project.findFirst.mockResolvedValue(null);

      await expect(
        service.createTicket({ title: 'New', projectId: 'elsewhere' }, 'org-uuid-1'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('first response (firstRespondedAt)', () => {
    beforeEach(() => {
      mockPrismaService.tickets.findUniqueOrThrow.mockResolvedValue(mockTicket);
      mockPrismaService.member.count.mockImplementation(({ where }: { where: { id: { in: string[] } } }) =>
        Promise.resolve(where.id.in.length),
      );
    });

    const updateData = () => mockPrismaService.tickets.update.mock.calls[0][0].data;

    it('is set when a ticket is created with an assignee', async () => {
      const create = jest.fn().mockResolvedValue(mockTicket);
      mockPrismaService.$transaction.mockImplementation(async (fn: Function) => fn({ tickets: { create } }));

      await service.createTicket({ title: 'New', assigneeIds: ['member-1'] }, 'org-uuid-1');

      expect(create.mock.calls[0][0].data.firstRespondedAt).toBeInstanceOf(Date);
    });

    it('is not set when a ticket is created unassigned', async () => {
      const create = jest.fn().mockResolvedValue(mockTicket);
      mockPrismaService.$transaction.mockImplementation(async (fn: Function) => fn({ tickets: { create } }));

      await service.createTicket({ title: 'New' }, 'org-uuid-1');

      expect(create.mock.calls[0][0].data.firstRespondedAt).toBeUndefined();
    });

    it('is set on the first assignment', async () => {
      mockPrismaService.tickets.findFirst.mockResolvedValue({ ...mockTicket, assignees: [], firstRespondedAt: null });
      const before = Date.now();

      await service.updateTicket(mockTicket.id, { assigneeIds: ['member-1'] }, 'org-uuid-1');

      expect(updateData().firstRespondedAt).toBeInstanceOf(Date);
      expect(updateData().firstRespondedAt.getTime()).toBeGreaterThanOrEqual(before);
    });

    it('is not changed by a reassignment', async () => {
      const firstRespondedAt = new Date('2026-10-01T08:00:00Z');
      mockPrismaService.tickets.findFirst.mockResolvedValue({
        ...mockTicket,
        assignees: [{ memberId: 'member-1' }],
        firstRespondedAt,
      });

      await service.updateTicket(mockTicket.id, { assigneeIds: ['member-2'] }, 'org-uuid-1');

      expect(updateData()).not.toHaveProperty('firstRespondedAt');
    });

    it('is not changed when assignees are cleared or the update does not assign anyone', async () => {
      mockPrismaService.tickets.findFirst.mockResolvedValue({ ...mockTicket, assignees: [{ memberId: 'member-1' }] });

      await service.updateTicket(mockTicket.id, { assigneeIds: [] }, 'org-uuid-1');
      await service.updateTicket(mockTicket.id, { title: 'Edit only' }, 'org-uuid-1');

      for (const [call] of mockPrismaService.tickets.update.mock.calls) {
        expect(call.data).not.toHaveProperty('firstRespondedAt');
      }
    });

    it('is not stamped when an older assigned ticket is saved with the same assignees', async () => {
      mockPrismaService.tickets.findFirst.mockResolvedValue({
        ...mockTicket,
        assignees: [{ memberId: 'member-1' }],
        firstRespondedAt: null,
      });

      await service.updateTicket(mockTicket.id, { assigneeIds: ['member-1'], title: 'Edit' }, 'org-uuid-1');

      expect(updateData()).not.toHaveProperty('firstRespondedAt');
    });
  });

  describe('SLA on reads', () => {
    const policies = [
      { id: 'org-high', name: 'Org HIGH', projectId: null, priority: 'HIGH', firstResponseMinutes: 60, resolutionMinutes: 480 },
      { id: 'proj-high', name: 'Project HIGH', projectId: 'project-a', priority: 'HIGH', firstResponseMinutes: 30, resolutionMinutes: 240 },
    ];

    it('attaches the matched policy state to list rows and loads only active policies', async () => {
      const createdAt = new Date(Date.now() - 10 * 60_000);
      mockPrismaService.tickets.findMany.mockResolvedValue([
        { ...mockTicket, id: 'a', priority: 'HIGH', projectId: 'project-a', createdAt },
        { ...mockTicket, id: 'b', priority: 'HIGH', projectId: null, createdAt },
        { ...mockTicket, id: 'c', priority: 'LOW', projectId: 'project-a', createdAt },
      ]);
      mockPrismaService.tickets.count.mockResolvedValue(3);
      mockPrismaService.slaPolicy.findMany.mockResolvedValue(policies);

      const { data } = await service.getAllTickets({ page: 1, limit: 10 }, 'org-uuid-1');

      expect(mockPrismaService.slaPolicy.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { organizationId: 'org-uuid-1', isActive: true, isArchived: false } }),
      );
      expect(data.map((t) => [t.id, t.sla?.policyId ?? null, t.sla?.response.state ?? null])).toEqual([
        ['a', 'proj-high', 'ok'],
        ['b', 'org-high', 'ok'],
        ['c', null, null],
      ]);
    });

    it('attaches the SLA to the detail response', async () => {
      mockPrismaService.tickets.findFirst.mockResolvedValue({
        ...mockTicket,
        priority: 'HIGH',
        createdAt: new Date(Date.now() - 2 * 60 * 60_000),
      });
      mockPrismaService.slaPolicy.findMany.mockResolvedValue(policies);

      const ticket = await service.getTicketById(mockTicket.id, 'org-uuid-1');

      expect(ticket.sla).toMatchObject({ policyId: 'org-high', scope: 'organization', response: { state: 'breached' } });
    });
  });
});
