import { ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../../core/database/prisma.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { ClientsService } from '../clients/clients.service';
import { FakeApptivoSyncPrisma } from '../../../../test/fakes/apptivo-sync-prisma.fake';
import { ProjectsService } from './projects.service';
import { projectVisibility, visibleProjects } from './project-visibility';

describe('Internal projects, membership and state notifications', () => {
  const project = { id: 'example-project', clientId: 'example-client', organizationId: 'example-org', apptivoId: null, displayName: 'Example internal project', quoteSubject: null, workOrderNumber: 'INTERNAL-example', client: null, isArchived: false, isClosed: false };
  const prisma = {
    member: { findUnique: jest.fn(), findMany: jest.fn() },
    project: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn(), findMany: jest.fn(), count: jest.fn() },
    client: { findFirst: jest.fn() }, projectMember: { findMany: jest.fn(), createMany: jest.fn(), deleteMany: jest.fn() },
  };
  const notifications = { create: jest.fn(), createMany: jest.fn() };
  let service: ProjectsService;
  beforeEach(() => {
    jest.resetAllMocks(); prisma.member.findUnique.mockResolvedValue({ id: 'example-member', role: 'admin' });
    prisma.project.findFirst.mockResolvedValue(project); prisma.project.create.mockResolvedValue(project); prisma.project.update.mockResolvedValue(project);
    prisma.client.findFirst.mockResolvedValue({ id: 'example-client', customerName: 'Example client' });
    prisma.projectMember.createMany.mockResolvedValue({ count: 1 }); prisma.projectMember.deleteMany.mockResolvedValue({ count: 1 });
    prisma.projectMember.findMany.mockResolvedValue([{ userId: 'example-recipient' }]);
    prisma.project.findMany.mockResolvedValue([]); prisma.project.count.mockResolvedValue(0);
    service = new ProjectsService(prisma as unknown as PrismaService, {} as ClientsService, notifications as unknown as NotificationsService);
  });
  it('creates internal projects with a required active client, no source ID and no implicit members', async () => {
    await service.createProject({ name: ' Example internal project ', clientId: project.clientId }, project.organizationId, 'example-admin');
    expect(prisma.project.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ apptivoId: null, organizationId: project.organizationId, clientId: project.clientId, clientLocked: true, displayName: project.displayName }) as unknown }));
    expect(prisma.projectMember.createMany).not.toHaveBeenCalled();
  });
  it.each(['owner', 'admin', 'member'])('uses project membership visibility for %s', async role => {
    prisma.member.findUnique.mockResolvedValue({ id: 'example-member', role });
    const scope = await projectVisibility(prisma as unknown as PrismaService, project.organizationId, 'example-user');
    expect(visibleProjects(scope)).toEqual(role === 'member' ? { members: { some: { organizationId: project.organizationId, userId: 'example-user' } } } : {});
    await service.getAllProjects({ page: 1, limit: 10 }, project.organizationId, 'example-user');
    expect(prisma.project.count).toHaveBeenCalledWith({ where: { organizationId: project.organizationId, isArchived: false, ...visibleProjects(scope) } });
  });
  it('rejects missing identity, missing membership and ordinary-member mutations', async () => {
    await expect(projectVisibility(prisma as unknown as PrismaService, project.organizationId)).rejects.toThrow(ForbiddenException);
    prisma.member.findUnique.mockResolvedValue(null);
    await expect(service.getAllProjects({ page: 1, limit: 10 }, project.organizationId, 'example-user')).rejects.toThrow(ForbiddenException);
    prisma.member.findUnique.mockResolvedValue({ id: 'example-member', role: 'member' });
    await expect(service.createProject({ name: 'Example', clientId: project.clientId }, project.organizationId, 'example-user')).rejects.toThrow(ForbiddenException);
  });
  it('treats closed as metadata and only filters when requested', async () => {
    await service.setState(project.id, { isClosed: true }, project.organizationId, 'example-admin');
    expect(prisma.project.update).toHaveBeenCalledWith(expect.objectContaining({ data: { isClosed: true } }));
    await service.getAllProjects({ page: 1, limit: 10, includeClosed: false }, project.organizationId, 'example-admin');
    expect(prisma.project.count).toHaveBeenCalledWith({ where: { organizationId: project.organizationId, isArchived: false, isClosed: false } });
  });
  it.each([true, false])('notifies project member added=%s only after the membership write, and failures do not fail it', async add => {
    notifications.create.mockRejectedValue(new Error('Invented notification failure'));
    await expect(service.changeMember(project.id, 'example-recipient', add, project.organizationId, 'example-admin')).resolves.toEqual({ changed: true });
    expect(notifications.create).toHaveBeenCalledWith(expect.objectContaining({ recipientUserId: 'example-recipient', actorUserId: 'example-admin', type: add ? 'project_member_added' : 'project_member_removed' }));
    expect(notifications.create.mock.invocationCallOrder[0]).toBeGreaterThan((add ? prisma.projectMember.createMany : prisma.projectMember.deleteMany).mock.invocationCallOrder[0]);
  });
  it.each([true, false])('manual archive=%s notifies members after commit and survives notification failure', async isArchived => {
    prisma.project.findFirst.mockResolvedValue({ ...project, isArchived: !isArchived }); notifications.createMany.mockRejectedValue(new Error('Invented emit failure'));
    await expect(service.setState(project.id, { isArchived }, project.organizationId, 'example-admin')).resolves.toBeDefined();
    expect(prisma.project.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ isArchived, archivedManually: isArchived }) as unknown }));
    expect(notifications.createMany).toHaveBeenCalledWith([expect.objectContaining({ recipientUserId: 'example-recipient', type: 'project_archived' })]);
    expect(notifications.createMany.mock.invocationCallOrder[0]).toBeGreaterThan(prisma.project.update.mock.invocationCallOrder[0]);
  });
});

describe('Apptivo source boundaries', () => {
  it('preserves null-ID internal rows and legacy seed rows, and keeps manual archives archived and untouched', async () => {
    const fake = new FakeApptivoSyncPrisma(); const org = 'example-org';
    const [internalClient, seedClient] = fake.client.seed([{ organizationId: org, apptivoId: null, customerName: 'Example internal' }, { organizationId: org, apptivoId: 'seed-client-001', customerName: 'Example seed' }]);
    const [internal, seed, manual] = fake.project.seed([
      { organizationId: org, apptivoId: null, workOrderNumber: 'Example internal', clientId: internalClient.id },
      { organizationId: org, apptivoId: 'local-timesheet-wo-001', workOrderNumber: 'Example seed', clientId: seedClient.id },
      { organizationId: org, apptivoId: 'example-source', workOrderNumber: 'Manually retained name', isArchived: true, archivedManually: true, clientId: internalClient.id },
    ]);
    const before = [...fake.client.rows, ...fake.project.rows].map(row => ({ ...row }));
    const clients = new ClientsService(fake as unknown as PrismaService);
    const service = new ProjectsService(fake as unknown as PrismaService, clients, {} as NotificationsService);
    await clients.reconcileClients(fake as unknown as import('@prisma/client').Prisma.TransactionClient, org, [{ customerId: 'example-other', customerName: 'Example source client' }]);
    const reconcile = service as unknown as { reconcileProjects(tx: unknown, org: string, orders: unknown[]): Promise<unknown> };
    await reconcile.reconcileProjects(fake, org, [{ id: 'example-source', workOrderNumber: 'Source changed', statusName: 'active', total: '1' }, { id: 'example-other-project', workOrderNumber: 'Example source work', statusName: 'active', total: '0' }]);
    for (const row of [internalClient, seedClient, internal, seed, manual]) expect([...fake.client.rows, ...fake.project.rows].find(stored => stored.id === row.id)).toEqual(before.find(stored => stored.id === row.id));
    expect(fake.projectByApptivoId(org, 'example-source')).toMatchObject({ isArchived: true, archivedManually: true, workOrderNumber: 'Manually retained name' });
  });
});
