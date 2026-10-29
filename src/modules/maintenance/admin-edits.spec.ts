import { NotificationsService } from '../notifications/notifications.service';
import { BadRequestException, ForbiddenException, RequestMethod } from '@nestjs/common';
import { METHOD_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { MaintenanceAuditEntity } from '@prisma/client';

import { PrismaService } from '../../core/database/prisma.service';
import { ProjectsService } from './projects/projects.service';
import { ProjectsController } from './projects/projects.controller';
import { ClientsService } from './clients/clients.service';
import { ClientsController } from './clients/clients.controller';

const ORG = 'org-1';
const ADMIN_USER = 'user-admin';
const MEMBER_USER = 'user-member';

const storedProject = {
  id: 'project-1',
  workOrderNumber: 'SO-2024-1441',
  customerName: 'Denso PH',
  status: 'Completed',
  total: 1000,
  reportedDate: null,
  quoteSubject: 'Denso RTLS QR Code App - SW only',
  apptivoQuoteRefId: '21462059122',
  displayName: null as string | null,
  clientLocked: false,
  apptivoId: 'wo-1',
  organizationId: ORG,
  clientId: 'client-1' as string | null,
  isArchived: false,
  archivedAt: null,
  client: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const storedClient = {
  id: 'client-1',
  apptivoId: 'cust-1',
  customerName: 'Denso Philippines Corp.',
  displayName: null as string | null,
  organizationId: ORG,
  isArchived: false,
  archivedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  _count: { projects: 2 },
};

const prisma = {
  member: { findUnique: jest.fn() },
  project: { findFirst: jest.fn(), findUniqueOrThrow: jest.fn(), update: jest.fn(), groupBy: jest.fn() },
  client: { findFirst: jest.fn(), findUniqueOrThrow: jest.fn(), update: jest.fn() },
  maintenanceAuditLog: { create: jest.fn() },
  $transaction: jest.fn(),
};

describe('Admin edits of projects and clients', () => {
  let projects: ProjectsService;
  let clients: ClientsService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [{ provide: NotificationsService, useValue: { create: jest.fn(), createMany: jest.fn() } }, ProjectsService, ClientsService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    projects = module.get(ProjectsService);
    clients = module.get(ClientsService);

    jest.resetAllMocks();
    prisma.$transaction.mockImplementation((fn: (tx: typeof prisma) => Promise<unknown>) => fn(prisma));
    prisma.member.findUnique.mockImplementation(({ where }: { where: { organizationId_userId: { userId: string } } }) => {
      const { userId } = where.organizationId_userId;
      if (userId === ADMIN_USER) return Promise.resolve({ id: 'member-admin', role: 'admin' });
      if (userId === MEMBER_USER) return Promise.resolve({ id: 'member-plain', role: 'member' });
      return Promise.resolve(null);
    });
    prisma.project.findFirst.mockResolvedValue(storedProject);
    prisma.project.findUniqueOrThrow.mockResolvedValue(storedProject);
    prisma.project.groupBy.mockResolvedValue([]);
    prisma.client.findFirst.mockResolvedValue(storedClient);
    prisma.client.findUniqueOrThrow.mockResolvedValue(storedClient);
  });

  const expectNoWrites = () => {
    expect(prisma.project.update).not.toHaveBeenCalled();
    expect(prisma.client.update).not.toHaveBeenCalled();
    expect(prisma.maintenanceAuditLog.create).not.toHaveBeenCalled();
  };

  describe('PATCH routes', () => {
    const reflector = new Reflector();

    const handlerOf = (controller: { prototype: object }, method: string) =>
      Object.getOwnPropertyDescriptor(controller.prototype, method)?.value as (...args: unknown[]) => unknown;

    it.each([
      ['PATCH /maintenance/projects/:id', handlerOf(ProjectsController, 'updateProject')],
      ['PATCH /maintenance/clients/:id', handlerOf(ClientsController, 'updateClient')],
    ])('%s requires the owner or admin org role and is not anonymous', (_route, handler) => {
      expect(reflector.get(METHOD_METADATA, handler)).toBe(RequestMethod.PATCH);
      expect(reflector.get('orgRoles', handler)).toEqual([['owner', 'admin']]);
      expect(reflector.get('allowAnonymous', handler)).toBeUndefined();
    });
  });

  describe('rejects non-admins', () => {
    it.each([
      ['a plain member', MEMBER_USER],
      ['a user outside the organization', 'user-stranger'],
      ['a request with no user', undefined],
    ])('project edit by %s throws 403 and writes nothing', async (_who, userId) => {
      await expect(projects.updateProject(storedProject.id, { displayName: 'Hacked' }, ORG, userId)).rejects.toThrow(
        ForbiddenException,
      );
      expectNoWrites();
    });

    it('client edit by a plain member throws 403 and writes nothing', async () => {
      await expect(clients.updateClient(storedClient.id, { displayName: 'Hacked' }, ORG, MEMBER_USER)).rejects.toThrow(
        ForbiddenException,
      );
      expectNoWrites();
    });
  });

  describe('project edits by an admin', () => {
    it('sets a trimmed display name and audits who changed it', async () => {
      await projects.updateProject(storedProject.id, { displayName: '  Denso RTLS Phase 1 ' }, ORG, ADMIN_USER);

      expect(prisma.project.update).toHaveBeenCalledWith({
        where: { id: storedProject.id },
        data: { displayName: 'Denso RTLS Phase 1' },
      });
      expect(prisma.maintenanceAuditLog.create).toHaveBeenCalledWith({
        data: {
          organizationId: ORG,
          entityType: MaintenanceAuditEntity.PROJECT,
          entityId: storedProject.id,
          actorMemberId: 'member-admin',
          changes: { displayName: { from: null, to: 'Denso RTLS Phase 1' } },
        },
      });
    });

    it('resets to the Apptivo name when the display name is cleared', async () => {
      prisma.project.findFirst.mockResolvedValue({ ...storedProject, displayName: 'Custom' });

      await projects.updateProject(storedProject.id, { displayName: '   ' }, ORG, ADMIN_USER);

      expect(prisma.project.update).toHaveBeenCalledWith({ where: { id: storedProject.id }, data: { displayName: null } });
    });

    it('locks a hand-picked client', async () => {
      prisma.client.findFirst.mockResolvedValue({ isArchived: false });

      await projects.updateProject(storedProject.id, { clientId: 'client-2' }, ORG, ADMIN_USER);

      expect(prisma.project.update).toHaveBeenCalledWith({
        where: { id: storedProject.id },
        data: { clientId: 'client-2', clientLocked: true },
      });
      expect(prisma.maintenanceAuditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          changes: { clientId: { from: 'client-1', to: 'client-2' }, clientLocked: { from: false, to: true } },
        }) as object,
      });
    });

    it('hands the client back to the sync when clientLocked is cleared', async () => {
      prisma.project.findFirst.mockResolvedValue({ ...storedProject, clientLocked: true });

      await projects.updateProject(storedProject.id, { clientLocked: false }, ORG, ADMIN_USER);

      expect(prisma.project.update).toHaveBeenCalledWith({ where: { id: storedProject.id }, data: { clientLocked: false } });
    });

    it('rejects reassignment to an archived client', async () => {
      prisma.client.findFirst.mockResolvedValue({ isArchived: true });

      await expect(projects.updateProject(storedProject.id, { clientId: 'client-gone' }, ORG, ADMIN_USER)).rejects.toThrow(
        BadRequestException,
      );
      expectNoWrites();
    });

    it('writes nothing and logs nothing when nothing changes', async () => {
      await projects.updateProject(storedProject.id, { displayName: null }, ORG, ADMIN_USER);

      expectNoWrites();
    });
  });

  describe('client edits by an admin', () => {
    it('sets the display name and audits it', async () => {
      await clients.updateClient(storedClient.id, { displayName: 'Denso' }, ORG, ADMIN_USER);

      expect(prisma.client.update).toHaveBeenCalledWith({ where: { id: storedClient.id }, data: { displayName: 'Denso' } });
      expect(prisma.maintenanceAuditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          entityType: MaintenanceAuditEntity.CLIENT,
          actorMemberId: 'member-admin',
          changes: { displayName: { from: null, to: 'Denso' } },
        }) as object,
      });
    });
  });
});
