import { InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Prisma } from '@prisma/client';

import { TicketsService } from './tickets.service';
import { PrismaService } from '../../core/database/prisma.service';
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
};

const mockPrismaService = {
  tickets: {
    findMany: jest.fn(),
    count: jest.fn(),
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
  $transaction: jest.fn(),
};

describe('TicketsService', () => {
  let service: TicketsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TicketsService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<TicketsService>(TicketsService);
    jest.resetAllMocks();
  });

  describe('getAllTickets', () => {
    it('returns paginated tickets', async () => {
      mockPrismaService.tickets.findMany.mockResolvedValue([mockTicket]);
      mockPrismaService.tickets.count.mockResolvedValue(1);

      const result = await service.getAllTickets({ page: 1, limit: 10 }, 'org-uuid-1');

      expect(result.data).toEqual([mockTicket]);
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
  });

  describe('createTicket', () => {
    const dto = {
      title: 'Test Ticket',
      priority: 'MEDIUM' as const,
    };

    it('creates and returns a ticket', async () => {
      mockPrismaService.tickets.create.mockResolvedValue(mockTicket);

      const result = await service.createTicket(dto, 'org-uuid-1');

      expect(mockPrismaService.tickets.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            title: dto.title,
            priority: dto.priority,
            organization: { connect: { id: 'org-uuid-1' } },
          }),
        }),
      );
      expect(result).toEqual(mockTicket);
    });

    it('deduplicates assigneeIds before creating', async () => {
      mockPrismaService.member.count.mockResolvedValue(1);
      mockPrismaService.tickets.create.mockResolvedValue(mockTicket);

      await service.createTicket(
        { ...dto, assigneeIds: ['member-1', 'member-1'] },
        'org-uuid-1',
      );

      const createCall = mockPrismaService.tickets.create.mock.calls[0][0];
      const assigneeData = createCall.data.assignees.createMany.data;
      expect(assigneeData).toHaveLength(1);
    });

    it('retries on ticket number collision and eventually succeeds', async () => {
      const collisionError = new Prisma.PrismaClientKnownRequestError('collision', {
        code: 'P2002',
        clientVersion: '5.0.0',
        meta: { target: ['ticket_number'] },
      });

      mockPrismaService.tickets.create
        .mockRejectedValueOnce(collisionError)
        .mockResolvedValueOnce(mockTicket);

      const result = await service.createTicket(dto, 'org-uuid-1');

      expect(mockPrismaService.tickets.create).toHaveBeenCalledTimes(2);
      expect(result).toEqual(mockTicket);
    });

    it('throws InternalServerErrorException after max retries', async () => {
      const collisionError = new Prisma.PrismaClientKnownRequestError('collision', {
        code: 'P2002',
        clientVersion: '5.0.0',
        meta: { target: ['ticket_number'] },
      });

      mockPrismaService.tickets.create.mockRejectedValue(collisionError);

      await expect(service.createTicket(dto, 'org-uuid-1')).rejects.toThrow(
        InternalServerErrorException,
      );

      expect(mockPrismaService.tickets.create).toHaveBeenCalledTimes(MAX_TICKET_NUMBER_RETRIES);
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

  describe('updateTicket', () => {
    it('updates ticket and syncs assignees in a transaction', async () => {
      mockPrismaService.member.count.mockResolvedValue(1);

      mockPrismaService.$transaction.mockImplementation(async (fn: Function) => {
        return fn({
          tickets: {
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
      expect(result).toEqual(mockTicket);
    });

    it('does not touch assignees when assigneeIds is undefined', async () => {
      const deleteMany = jest.fn();
      mockPrismaService.$transaction.mockImplementation(async (fn: Function) => {
        return fn({
          tickets: {
            update: jest.fn(),
            findUniqueOrThrow: jest.fn().mockResolvedValue(mockTicket),
          },
          ticketAssignee: { deleteMany },
        });
      });

      await service.updateTicket('ticket-uuid-1', { title: 'Updated' }, 'org-uuid-1');

      expect(deleteMany).not.toHaveBeenCalled();
    });
  });
});