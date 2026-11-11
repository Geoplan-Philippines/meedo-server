import { Prisma } from '@prisma/client';
import { FakeApptivoSyncPrisma } from '../../../../test/fakes/apptivo-sync-prisma.fake';
import { PrismaService } from '../../../core/database/prisma.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { ClientsService } from '../clients/clients.service';
import { ProjectsService } from './projects.service';

describe('Apptivo reference-only imports', () => {
  it('refreshes references while preserving every Meedo-owned field, including an unlocked client and manual archive', async () => {
    const db = new FakeApptivoSyncPrisma();
    const [source, chosen] = db.client.seed([
      { organizationId: 'example-org', apptivoId: 'source-client', customerName: 'Example source', displayName: 'Chosen client name' },
      { organizationId: 'example-org', apptivoId: null, customerName: null, displayName: 'Internal client' },
    ]);
    const archivedAt = new Date('2026-01-01');
    const [project] = db.project.seed([{ organizationId: 'example-org', apptivoId: 'source-project',
      displayName: 'Meedo project', workOrderNumber: 'Old reference', clientId: chosen.id, clientLocked: false,
      status: 'Meedo status', total: 7, reportedDate: archivedAt, isClosed: true, isArchived: true, archivedManually: true, archivedAt,
      missingFromApptivoAt: archivedAt,
    }]);
    const prisma = db as unknown as PrismaService;
    const clients = new ClientsService(prisma);
    const service = new ProjectsService(prisma, clients, {} as NotificationsService);
    jest.spyOn(clients, 'fetchApptivoCustomers').mockResolvedValue([{ customerId: source.apptivoId!, customerName: 'Refreshed customer reference' }]);
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValueOnce(new Response(JSON.stringify({ data: [{ id: project.apptivoId!, customerId: source.apptivoId!, workOrderNumber: 'Refreshed WO', statusName: 'Upstream status', total: 99, reportedDate: '2026-10-29', fromObjectRefId: 'Example quote ref', customAttributes: [{ customAttributeName: 'referenceField_1617259959312_729_1007781617259959312_311', customAttributeValue: 'Example quote subject' }] }] }), { status: 200 }));
    try { await service.syncWorkOrdersFromApptivo('example-org'); } finally { fetchMock.mockRestore(); }
    expect(db.projectByApptivoId('example-org', project.apptivoId!)).toMatchObject({
      displayName: 'Meedo project', clientId: chosen.id, clientLocked: false,
      status: 'Meedo status', total: 7, reportedDate: archivedAt, isClosed: true, isArchived: true, archivedManually: true, archivedAt,
      workOrderNumber: 'Refreshed WO', customerName: 'Refreshed customer reference', quoteSubject: 'Example quote subject', apptivoQuoteRefId: 'Example quote ref', missingFromApptivoAt: null,
    });
    expect(db.clientByApptivoId('example-org', source.apptivoId!)).toMatchObject({ displayName: 'Chosen client name' });
    expect(db.client.rows.find(c => c.id === chosen.id)).toEqual(chosen);
    expect(db.project.update.mock.calls[0][0].data).not.toHaveProperty('members');
  });

  it('keeps the first missing date, clears it on return, and preserves archive state', async () => {
    const db = new FakeApptivoSyncPrisma();
    db.client.seed([{ organizationId: 'example-org', apptivoId: 'example-client', customerName: 'Example client', isArchived: true }]);
    const clients = new ClientsService(db as unknown as PrismaService);
    const tx = db as unknown as Prisma.TransactionClient;
    const other = [{ customerId: 'example-other', customerName: 'Example other' }];
    expect((await clients.reconcileClients(tx, 'example-org', other)).missing).toBe(1);
    const first = db.clientByApptivoId('example-org', 'example-client')?.missingFromApptivoAt;
    expect(first).toBeInstanceOf(Date);
    expect((await clients.reconcileClients(tx, 'example-org', other)).missing).toBe(0);
    expect(db.clientByApptivoId('example-org', 'example-client')?.missingFromApptivoAt).toEqual(first);
    await clients.reconcileClients(tx, 'example-org', [...other, { customerId: 'example-client', customerName: 'Example client' }]);
    expect(db.clientByApptivoId('example-org', 'example-client')).toMatchObject({ missingFromApptivoAt: null, isArchived: true });
  });
});
