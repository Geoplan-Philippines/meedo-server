import { Test, TestingModule } from '@nestjs/testing';
import { HttpException } from '@nestjs/common';
import { PrismaService } from '../../../core/database/prisma.service';
import { ProjectsService } from './projects.service';
import { ClientsService } from '../clients/clients.service';
import { FakeApptivoSyncPrisma } from '../../../../test/fakes/apptivo-sync-prisma.fake';
import { env } from '../../../core/config/env.config';

const mockProject = {
  id: '111222333',
  workOrderNumber: 'IO-2026-1111',
  status: 'active',
  total: 1000,
  reportedDate: null,
  customerName: 'Clark PH',
  quoteSubject: 'Denso RTLS Dashboard Software',
  apptivoQuoteRefId: '21462059122',
  apptivoId: 'apptivo-123',
  organizationId: 'org-geo',
  clientId: null,
  isArchived: false,
  archivedAt: null,
  client: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockPrismaService = {
  project: {
    findMany: jest.fn(),
    count: jest.fn(),
  },
};

global.fetch = jest.fn();

const mockWorkOrdersResponse = (workOrders: unknown[]) =>
  (global.fetch as jest.Mock).mockResolvedValue({
    ok: true,
    json: jest.fn().mockResolvedValue({ data: workOrders }),
  });

/** Serves `workOrders` in 500-record pages keyed on startIndex, reporting `countOfRecords`. */
const mockPagedWorkOrdersResponse = (workOrders: unknown[], countOfRecords = workOrders.length) =>
  (global.fetch as jest.Mock).mockImplementation((url: string) => {
    const startIndex = Number(new URL(url).searchParams.get('startIndex'));
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ data: workOrders.slice(startIndex, startIndex + 500), countOfRecords }),
    });
  });

const QUOTE_SUBJECT_ATTRIBUTE = 'referenceField_1617259959312_729_1007781617259959312_311';

/** Apptivo shape: the subject is the customAttributeValue of the entry whose customAttributeName is QUOTE_SUBJECT_ATTRIBUTE. */
const quoteAttributes = (subject: string) => [
  { customAttributeName: 'reference_1617258977886_261_1129171617258977886_92', customAttributeValue: 'SQ-2024-4286' },
  { customAttributeId: 'referenceField_57_1617258997609', customAttributeName: QUOTE_SUBJECT_ATTRIBUTE, customAttributeValue: subject },
];

const workOrder = (overrides: Record<string, unknown> = {}) => ({
  id: 'wo-1',
  workOrderNumber: 'SO-2026-1111',
  customerName: 'Clark PH',
  customerId: 'cust-1',
  statusName: 'active',
  total: '1000',
  reportedDate: '2026-01-01',
  ...overrides,
});

describe('ProjectsService', () => {
  let service: ProjectsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProjectsService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: ClientsService, useValue: {} },
      ],
    }).compile();

    service = module.get<ProjectsService>(ProjectsService);
    jest.resetAllMocks();
  });

  describe('getAllProjects', () => {
    it('returns paginated projects', async () => {
      mockPrismaService.project.findMany.mockResolvedValue([mockProject]);
      mockPrismaService.project.count.mockResolvedValue(1);

      const result = await service.getAllProjects({ page: 1, limit: 10 }, 'org-uuid-1');

      expect(result.data).toEqual([{ ...mockProject, name: 'Denso RTLS Dashboard Software' }]);
      expect(result.meta.total).toBe(1);
      expect(result.meta.lastPage).toBe(1);
    });

    it('names a project displayName, else quoteSubject, else workOrderNumber, and names its client', async () => {
      const client = { id: 'c1', customerName: 'Denso PH', displayName: 'Denso' };
      mockPrismaService.project.findMany.mockResolvedValue([
        { ...mockProject, id: 'a', displayName: 'RTLS Phase 2', client },
        { ...mockProject, id: 'b', displayName: null, client: { ...client, displayName: null } },
        { ...mockProject, id: 'c', displayName: '  ', quoteSubject: null },
      ]);
      mockPrismaService.project.count.mockResolvedValue(3);

      const { data } = await service.getAllProjects({ page: 1, limit: 10 }, 'org-uuid-1');

      expect(data.map((p) => [p.name, p.client?.name ?? null])).toEqual([
        ['RTLS Phase 2', 'Denso'],
        ['Denso RTLS Dashboard Software', 'Denso PH'],
        ['IO-2026-1111', null],
      ]);
    });

    it('filters by Dept through tickets of that team, and lists unassigned projects', async () => {
      mockPrismaService.project.findMany.mockResolvedValue([]);
      mockPrismaService.project.count.mockResolvedValue(0);

      await service.getAllProjects({ page: 1, limit: 10, teamId: 'team-1', unassigned: true, clientId: 'ignored' }, 'org-uuid-1');

      expect(mockPrismaService.project.count).toHaveBeenCalledWith({
        where: {
          organizationId: 'org-uuid-1',
          clientId: null,
          tickets: { some: { teamId: 'team-1', isArchived: false } },
          isArchived: false,
        },
      });
    });

    it('searches display name, quote subject and WO number, filters by status and sorts', async () => {
      mockPrismaService.project.findMany.mockResolvedValue([]);
      mockPrismaService.project.count.mockResolvedValue(0);

      await service.getAllProjects(
        { page: 1, limit: 10, search: ' denso ', status: 'Completed', sortField: 'reportedDate', sortOrder: 'asc' },
        'org-uuid-1',
      );

      const where = {
        organizationId: 'org-uuid-1',
        isArchived: false,
        status: 'Completed',
        OR: [
          { displayName: { contains: 'denso', mode: 'insensitive' } },
          { quoteSubject: { contains: 'denso', mode: 'insensitive' } },
          { workOrderNumber: { contains: 'denso', mode: 'insensitive' } },
        ],
      };
      expect(mockPrismaService.project.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where, orderBy: [{ reportedDate: 'asc' }, { id: 'asc' }] }),
      );
      expect(mockPrismaService.project.count).toHaveBeenCalledWith({ where });
    });

    it('calculates lastPage correctly', async () => {
      mockPrismaService.project.findMany.mockResolvedValue([]);
      mockPrismaService.project.count.mockResolvedValue(25);

      const result = await service.getAllProjects({ page: 1, limit: 10 }, 'org-uuid-1');

      expect(result.meta.lastPage).toBe(3);
    });

    it('skips correct number of records based on page', async () => {
      mockPrismaService.project.findMany.mockResolvedValue([]);
      mockPrismaService.project.count.mockResolvedValue(0);

      await service.getAllProjects({ page: 3, limit: 10 }, 'org-uuid-1');

      expect(mockPrismaService.project.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 20, take: 10 }),
      );
    });

    it('filters by clientId when provided', async () => {
      mockPrismaService.project.findMany.mockResolvedValue([]);
      mockPrismaService.project.count.mockResolvedValue(0);

      await service.getAllProjects({ page: 1, limit: 10, clientId: 'client-uuid-1' }, 'org-uuid-1');

      const where = { organizationId: 'org-uuid-1', clientId: 'client-uuid-1', isArchived: false };
      expect(mockPrismaService.project.findMany).toHaveBeenCalledWith(expect.objectContaining({ where }));
      expect(mockPrismaService.project.count).toHaveBeenCalledWith(expect.objectContaining({ where }));
    });

    it('excludes archived projects by default and does not filter by clientId when not provided', async () => {
      mockPrismaService.project.findMany.mockResolvedValue([]);
      mockPrismaService.project.count.mockResolvedValue(0);

      await service.getAllProjects({ page: 1, limit: 10 }, 'org-uuid-1');

      expect(mockPrismaService.project.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { organizationId: 'org-uuid-1', isArchived: false } }),
      );
    });

    it('includes archived projects when includeArchived is true', async () => {
      mockPrismaService.project.findMany.mockResolvedValue([]);
      mockPrismaService.project.count.mockResolvedValue(0);

      await service.getAllProjects({ page: 1, limit: 10, includeArchived: true }, 'org-uuid-1');

      expect(mockPrismaService.project.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { organizationId: 'org-uuid-1' } }),
      );
    });
  });

  describe('syncWorkOrdersFromApptivo', () => {
    const ORG = 'org-geo';
    let fake: FakeApptivoSyncPrisma;
    let syncService: ProjectsService;
    let clientsService: ClientsService;
    let customers: Array<{ customerId: string; customerName: string }>;

    beforeEach(async () => {
      fake = new FakeApptivoSyncPrisma();
      const module = await Test.createTestingModule({
        providers: [ProjectsService, ClientsService, { provide: PrismaService, useValue: fake }],
      }).compile();
      syncService = module.get(ProjectsService);
      clientsService = module.get(ClientsService);

      customers = [{ customerId: 'cust-1', customerName: 'Clark PH' }];
      jest.spyOn(clientsService, 'fetchApptivoCustomers').mockImplementation(() => Promise.resolve(customers));
    });

    afterEach(() => {
      for (const table of [fake.client, fake.project]) {
        expect(table.delete).not.toHaveBeenCalled();
        expect(table.deleteMany).not.toHaveBeenCalled();
      }
    });

    it('normalizes work order data and links the client', async () => {
      mockWorkOrdersResponse([workOrder({ id: 'app-123', workOrderNumber: 'IO-2026-1111' })]);

      await syncService.syncWorkOrdersFromApptivo(ORG);

      expect(fake.projectByApptivoId(ORG, 'app-123')).toMatchObject({
        workOrderNumber: 'IO-2026-1111',
        status: 'active',
        total: 1000,
        reportedDate: new Date('2026-01-01'),
        clientId: fake.clientByApptivoId(ORG, 'cust-1')!.id,
        isArchived: false,
      });
    });

    it('returns project and client counts in one transaction', async () => {
      mockWorkOrdersResponse([workOrder()]);

      const result = await syncService.syncWorkOrdersFromApptivo(ORG);

      expect(result).toEqual({
        synced: 1,
        created: 1,
        updated: 0,
        archived: 0,
        unarchived: 0,
        unmatched: 0,
        clients: { synced: 1, created: 1, updated: 0, archived: 0, unarchived: 0 },
      });
      expect(fake.$transaction).toHaveBeenCalledTimes(1);
    });

    it('keeps the same client row for a renamed customer and its projects keep their client', async () => {
      const [client] = fake.client.seed([{ organizationId: ORG, apptivoId: 'cust-1', customerName: 'Clark PH' }]);
      fake.project.seed([{ organizationId: ORG, apptivoId: 'wo-1', workOrderNumber: 'SO-2026-1111', status: 'active', total: 1000, reportedDate: new Date('2026-01-01'), clientId: client.id }]);
      customers = [{ customerId: 'cust-1', customerName: 'Clark Philippines Inc.' }];
      mockWorkOrdersResponse([workOrder({ customerName: 'Clark Philippines Inc.' })]);

      const result = await syncService.syncWorkOrdersFromApptivo(ORG);

      expect(result.clients).toMatchObject({ created: 0, updated: 1, archived: 0 });
      expect(fake.client.rows).toHaveLength(1);
      expect(fake.clientByApptivoId(ORG, 'cust-1')).toMatchObject({
        id: client.id,
        customerName: 'Clark Philippines Inc.',
        isArchived: false,
      });
      expect(fake.projectByApptivoId(ORG, 'wo-1')).toMatchObject({ clientId: client.id, isArchived: false });
    });

    it('archives a work order missing from Apptivo instead of deleting it, even with timesheet entries', async () => {
      const [client] = fake.client.seed([{ organizationId: ORG, apptivoId: 'cust-1', customerName: 'Clark PH' }]);
      const [gone] = fake.project.seed([{ organizationId: ORG, apptivoId: 'wo-gone', workOrderNumber: 'SO-OLD', status: 'active', total: 5, reportedDate: null, clientId: client.id }]);
      fake.timesheetProjectIds.add(gone.id);
      mockWorkOrdersResponse([workOrder()]);

      const result = await syncService.syncWorkOrdersFromApptivo(ORG);

      expect(result).toMatchObject({ created: 1, archived: 1 });
      const archived = fake.projectByApptivoId(ORG, 'wo-gone');
      expect(archived).toMatchObject({ id: gone.id, clientId: client.id, isArchived: true, archivedAt: expect.any(Date) as Date });
      expect(fake.project.rows.map((p) => p.id)).toEqual(expect.arrayContaining([...fake.timesheetProjectIds]));
    });

    it('un-archives a work order that comes back', async () => {
      const [client] = fake.client.seed([{ organizationId: ORG, apptivoId: 'cust-1', customerName: 'Clark PH' }]);
      const [returning] = fake.project.seed([{ organizationId: ORG, apptivoId: 'wo-1', workOrderNumber: 'SO-2026-1111', status: 'active', total: 1000, reportedDate: new Date('2026-01-01'), clientId: client.id, customerName: 'Clark PH', isArchived: true, archivedAt: new Date('2026-05-01') }]);
      mockWorkOrdersResponse([workOrder()]);

      const result = await syncService.syncWorkOrdersFromApptivo(ORG);

      expect(result).toMatchObject({ created: 0, updated: 0, unarchived: 1, archived: 0 });
      expect(fake.projectByApptivoId(ORG, 'wo-1')).toMatchObject({ id: returning.id, isArchived: false, archivedAt: null });
    });

    it('stores an unmatched work order with a null client and logs it', async () => {
      const warn = jest.spyOn(syncService['logger'], 'warn').mockImplementation(() => undefined);
      mockWorkOrdersResponse([workOrder({ id: 'wo-orphan', customerId: 'cust-missing' })]);

      const result = await syncService.syncWorkOrdersFromApptivo(ORG);

      expect(result).toMatchObject({ created: 1, unmatched: 1 });
      expect(fake.projectByApptivoId(ORG, 'wo-orphan')).toMatchObject({ clientId: null, isArchived: false });
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('cust-missing'));
    });

    it('keeps an existing client link when this sync cannot match the customer', async () => {
      const [client] = fake.client.seed([{ organizationId: ORG, apptivoId: 'cust-old', customerName: 'Old Customer' }]);
      fake.project.seed([{ organizationId: ORG, apptivoId: 'wo-1', workOrderNumber: 'SO-2026-1111', status: 'active', total: 1000, reportedDate: new Date('2026-01-01'), clientId: client.id }]);
      mockWorkOrdersResponse([workOrder({ customerId: 'cust-missing', statusName: 'closed' })]);

      const result = await syncService.syncWorkOrdersFromApptivo(ORG);

      expect(result).toMatchObject({ unmatched: 1, updated: 1 });
      expect(fake.projectByApptivoId(ORG, 'wo-1')).toMatchObject({ clientId: client.id, status: 'closed' });
    });

    it('leaves no partial client changes when the project step fails', async () => {
      fake.client.seed([
        { organizationId: ORG, apptivoId: 'cust-1', customerName: 'Old Name' },
        { organizationId: ORG, apptivoId: 'cust-gone', customerName: 'Gone' },
      ]);
      const clientsBefore = fake.client.rows.map((r) => ({ ...r }));
      customers = [
        { customerId: 'cust-1', customerName: 'New Name' },
        { customerId: 'cust-new', customerName: 'Brand New' },
      ];
      mockWorkOrdersResponse([workOrder()]);
      fake.project.createMany.mockRejectedValueOnce(new Error('project write failed'));

      await expect(syncService.syncWorkOrdersFromApptivo(ORG)).rejects.toThrow('project write failed');

      expect(fake.client.update).toHaveBeenCalled();
      expect(fake.client.createMany).toHaveBeenCalled();
      expect(fake.client.rows).toEqual(clientsBefore);
      expect(fake.project.rows).toHaveLength(0);
    });

    it('does not archive anything when Apptivo returns no work orders', async () => {
      fake.project.seed([{ organizationId: ORG, apptivoId: 'wo-1', workOrderNumber: 'SO-1', status: 'active', total: 1, reportedDate: null, clientId: null }]);
      mockWorkOrdersResponse([]);

      const result = await syncService.syncWorkOrdersFromApptivo(ORG);

      expect(result).toMatchObject({ synced: 0, archived: 0 });
      expect(fake.projectByApptivoId(ORG, 'wo-1')).toMatchObject({ isArchived: false });
    });

    it('does not write unchanged active projects', async () => {
      const [client] = fake.client.seed([{ organizationId: ORG, apptivoId: 'cust-1', customerName: 'Clark PH' }]);
      fake.project.seed([{ organizationId: ORG, apptivoId: 'wo-1', workOrderNumber: 'SO-2026-1111', status: 'active', total: 1000, reportedDate: new Date('2026-01-01'), clientId: client.id, customerName: 'Clark PH' }]);
      mockWorkOrdersResponse([workOrder()]);

      const result = await syncService.syncWorkOrdersFromApptivo(ORG);

      expect(result).toMatchObject({ created: 0, updated: 0, archived: 0, unarchived: 0 });
      expect(fake.project.update).not.toHaveBeenCalled();
    });

    describe('admin-owned fields', () => {
      it('never overwrites a project or client displayName', async () => {
        const [client] = fake.client.seed([{ organizationId: ORG, apptivoId: 'cust-1', customerName: 'Clark PH', displayName: 'Clark (key account)' }]);
        fake.project.seed([{ organizationId: ORG, apptivoId: 'wo-1', workOrderNumber: 'SO-OLD', status: 'active', total: 1, reportedDate: null, clientId: client.id, displayName: 'Clark RTLS rollout' }]);
        customers = [{ customerId: 'cust-1', customerName: 'Clark Philippines Inc.' }];
        mockWorkOrdersResponse([workOrder({ customAttributes: quoteAttributes('New quote subject') })]);

        const result = await syncService.syncWorkOrdersFromApptivo(ORG);

        expect(result).toMatchObject({ updated: 1, clients: { updated: 1 } });
        expect(fake.clientByApptivoId(ORG, 'cust-1')).toMatchObject({ customerName: 'Clark Philippines Inc.', displayName: 'Clark (key account)' });
        expect(fake.projectByApptivoId(ORG, 'wo-1')).toMatchObject({
          workOrderNumber: 'SO-2026-1111',
          quoteSubject: 'New quote subject',
          displayName: 'Clark RTLS rollout',
        });
        for (const call of [...fake.project.update.mock.calls, ...fake.client.update.mock.calls]) {
          expect(call[0].data).not.toHaveProperty('displayName');
        }
      });

      it('keeps a locked client even when Apptivo links the work order to another customer', async () => {
        const [apptivoClient, handPicked] = fake.client.seed([
          { organizationId: ORG, apptivoId: 'cust-1', customerName: 'Clark PH' },
          { organizationId: ORG, apptivoId: 'cust-2', customerName: 'Denso PH' },
        ]);
        fake.project.seed([{ organizationId: ORG, apptivoId: 'wo-1', workOrderNumber: 'SO-2026-1111', status: 'active', total: 1000, reportedDate: new Date('2026-01-01'), clientId: handPicked.id, clientLocked: true, customerName: 'Clark PH' }]);
        customers = [
          { customerId: 'cust-1', customerName: 'Clark PH' },
          { customerId: 'cust-2', customerName: 'Denso PH' },
        ];
        mockWorkOrdersResponse([workOrder({ statusName: 'closed' })]);

        await syncService.syncWorkOrdersFromApptivo(ORG);

        expect(fake.projectByApptivoId(ORG, 'wo-1')).toMatchObject({ clientId: handPicked.id, clientLocked: true, status: 'closed' });
        expect(apptivoClient.id).not.toBe(handPicked.id);
      });

      it('lets the sync set the client again once clientLocked is cleared', async () => {
        const [apptivoClient, handPicked] = fake.client.seed([
          { organizationId: ORG, apptivoId: 'cust-1', customerName: 'Clark PH' },
          { organizationId: ORG, apptivoId: 'cust-2', customerName: 'Denso PH' },
        ]);
        fake.project.seed([{ organizationId: ORG, apptivoId: 'wo-1', workOrderNumber: 'SO-2026-1111', status: 'active', total: 1000, reportedDate: new Date('2026-01-01'), clientId: handPicked.id, clientLocked: false, customerName: 'Clark PH' }]);
        customers = [
          { customerId: 'cust-1', customerName: 'Clark PH' },
          { customerId: 'cust-2', customerName: 'Denso PH' },
        ];
        mockWorkOrdersResponse([workOrder()]);

        await syncService.syncWorkOrdersFromApptivo(ORG);

        expect(fake.projectByApptivoId(ORG, 'wo-1')).toMatchObject({ clientId: apptivoClient.id });
      });
    });

    describe('customerName', () => {
      it('is filled from the matched client', async () => {
        customers = [{ customerId: 'cust-1', customerName: 'Clark Philippines Inc.' }];
        mockWorkOrdersResponse([workOrder({ customerName: 'Clark PH (old copy)' })]);

        await syncService.syncWorkOrdersFromApptivo(ORG);

        expect(fake.projectByApptivoId(ORG, 'wo-1')).toMatchObject({
          clientId: fake.clientByApptivoId(ORG, 'cust-1')!.id,
          customerName: 'Clark Philippines Inc.',
        });
      });

      it('is refreshed on an existing project from the matched client', async () => {
        const [client] = fake.client.seed([{ organizationId: ORG, apptivoId: 'cust-1', customerName: 'Clark PH' }]);
        fake.project.seed([{ organizationId: ORG, apptivoId: 'wo-1', workOrderNumber: 'SO-2026-1111', status: 'active', total: 1000, reportedDate: new Date('2026-01-01'), clientId: client.id }]);
        customers = [{ customerId: 'cust-1', customerName: 'Clark Philippines Inc.' }];
        mockWorkOrdersResponse([workOrder()]);

        const result = await syncService.syncWorkOrdersFromApptivo(ORG);

        expect(result).toMatchObject({ updated: 1 });
        expect(fake.projectByApptivoId(ORG, 'wo-1')).toMatchObject({ customerName: 'Clark Philippines Inc.' });
      });

      it('falls back to the work order customerName when no client matches', async () => {
        mockWorkOrdersResponse([workOrder({ id: 'wo-orphan', customerId: 'cust-missing', customerName: '  LBPI Leasing  ' })]);

        const result = await syncService.syncWorkOrdersFromApptivo(ORG);

        expect(result).toMatchObject({ unmatched: 1 });
        expect(fake.projectByApptivoId(ORG, 'wo-orphan')).toMatchObject({ clientId: null, customerName: 'LBPI Leasing' });
      });

      it('keeps the stored name when neither a client nor the work order has one', async () => {
        fake.project.seed([{ organizationId: ORG, apptivoId: 'wo-1', workOrderNumber: 'SO-2026-1111', status: 'active', total: 1000, reportedDate: new Date('2026-01-01'), clientId: null, customerName: 'Known Name' }]);
        mockWorkOrdersResponse([workOrder({ customerId: 'cust-missing', customerName: ' ', statusName: 'closed' })]);

        await syncService.syncWorkOrdersFromApptivo(ORG);

        expect(fake.projectByApptivoId(ORG, 'wo-1')).toMatchObject({ customerName: 'Known Name', status: 'closed' });
      });

      it('stores an empty name for a new unmatched work order without a name', async () => {
        mockWorkOrdersResponse([workOrder({ customerId: 'cust-missing', customerName: undefined })]);

        await syncService.syncWorkOrdersFromApptivo(ORG);

        expect(fake.projectByApptivoId(ORG, 'wo-1')).toMatchObject({ customerName: '' });
      });
    });

    describe('quoteSubject and apptivoQuoteRefId', () => {
      it('stores the trimmed quote subject and fromObjectRefId', async () => {
        mockWorkOrdersResponse([
          workOrder({ customAttributes: quoteAttributes('  Denso RTLS Dashboard Software '), fromObjectRefId: 21462059122 }),
        ]);

        await syncService.syncWorkOrdersFromApptivo(ORG);

        expect(fake.projectByApptivoId(ORG, 'wo-1')).toMatchObject({
          quoteSubject: 'Denso RTLS Dashboard Software',
          apptivoQuoteRefId: '21462059122',
        });
      });

      it('stores null when the values are blank or missing', async () => {
        mockWorkOrdersResponse([
          workOrder({ id: 'wo-blank', customAttributes: quoteAttributes('   '), fromObjectRefId: '' }),
          workOrder({ id: 'wo-missing' }),
        ]);

        await syncService.syncWorkOrdersFromApptivo(ORG);

        for (const apptivoId of ['wo-blank', 'wo-missing']) {
          expect(fake.projectByApptivoId(ORG, apptivoId)).toMatchObject({ quoteSubject: null, apptivoQuoteRefId: null });
        }
      });

      it('updates both values when they change in Apptivo', async () => {
        const [client] = fake.client.seed([{ organizationId: ORG, apptivoId: 'cust-1', customerName: 'Clark PH' }]);
        const [stored] = fake.project.seed([{ organizationId: ORG, apptivoId: 'wo-1', workOrderNumber: 'SO-2026-1111', status: 'active', total: 1000, reportedDate: new Date('2026-01-01'), clientId: client.id, customerName: 'Clark PH', quoteSubject: 'Denso RTLS QR Code App - SW only', apptivoQuoteRefId: '21462059122' }]);
        mockWorkOrdersResponse([
          workOrder({ customAttributes: quoteAttributes('Denso RTLS Dashboard Software'), fromObjectRefId: 21462066553 }),
        ]);

        const result = await syncService.syncWorkOrdersFromApptivo(ORG);

        expect(result).toMatchObject({ created: 0, updated: 1 });
        expect(fake.project.update).toHaveBeenCalledWith({
          where: { id: stored.id },
          data: { quoteSubject: 'Denso RTLS Dashboard Software', apptivoQuoteRefId: '21462066553' },
        });
        expect(fake.projectByApptivoId(ORG, 'wo-1')).toMatchObject({
          id: stored.id,
          quoteSubject: 'Denso RTLS Dashboard Software',
          apptivoQuoteRefId: '21462066553',
        });
      });

      it('clears both values when Apptivo no longer has them', async () => {
        const [client] = fake.client.seed([{ organizationId: ORG, apptivoId: 'cust-1', customerName: 'Clark PH' }]);
        fake.project.seed([{ organizationId: ORG, apptivoId: 'wo-1', workOrderNumber: 'SO-2026-1111', status: 'active', total: 1000, reportedDate: new Date('2026-01-01'), clientId: client.id, customerName: 'Clark PH', quoteSubject: 'Old subject', apptivoQuoteRefId: '21462059122' }]);
        mockWorkOrdersResponse([workOrder()]);

        await syncService.syncWorkOrdersFromApptivo(ORG);

        expect(fake.projectByApptivoId(ORG, 'wo-1')).toMatchObject({ quoteSubject: null, apptivoQuoteRefId: null });
      });

      it('does not write when the values are unchanged', async () => {
        const [client] = fake.client.seed([{ organizationId: ORG, apptivoId: 'cust-1', customerName: 'Clark PH' }]);
        fake.project.seed([{ organizationId: ORG, apptivoId: 'wo-1', workOrderNumber: 'SO-2026-1111', status: 'active', total: 1000, reportedDate: new Date('2026-01-01'), clientId: client.id, customerName: 'Clark PH', quoteSubject: 'Denso RTLS Dashboard Software', apptivoQuoteRefId: '21462059122' }]);
        mockWorkOrdersResponse([
          workOrder({ customAttributes: quoteAttributes('Denso RTLS Dashboard Software'), fromObjectRefId: 21462059122 }),
        ]);

        const result = await syncService.syncWorkOrdersFromApptivo(ORG);

        expect(result).toMatchObject({ updated: 0 });
        expect(fake.project.update).not.toHaveBeenCalled();
      });
    });

    describe('page cap', () => {
      const MAX_PAGES = 2;
      const workOrders = (count: number) =>
        Array.from({ length: count }, (_, i) => workOrder({ id: `wo-${i + 1}`, workOrderNumber: `SO-${i + 1}` }));

      beforeEach(() => {
        jest.replaceProperty(env, 'APPTIVO_SYNC_MAX_PAGES', MAX_PAGES);
      });

      afterEach(() => {
        jest.restoreAllMocks();
      });

      it('throws when the cap is reached with records remaining, and writes or archives nothing', async () => {
        const [client] = fake.client.seed([{ organizationId: ORG, apptivoId: 'cust-1', customerName: 'Clark PH' }]);
        fake.project.seed([{ organizationId: ORG, apptivoId: 'wo-existing', workOrderNumber: 'SO-OLD', status: 'active', total: 1, reportedDate: null, clientId: client.id }]);
        const clientsBefore = fake.client.rows.map((r) => ({ ...r }));
        const projectsBefore = fake.project.rows.map((r) => ({ ...r }));
        mockPagedWorkOrdersResponse(workOrders(1001));

        const sync = syncService.syncWorkOrdersFromApptivo(ORG);

        await expect(sync).rejects.toThrow(HttpException);
        await expect(sync).rejects.toThrow(
          'Apptivo work orders fetch hit the 2-page cap (APPTIVO_SYNC_MAX_PAGES) with 1 of 1001 records not fetched',
        );
        expect(global.fetch).toHaveBeenCalledTimes(MAX_PAGES);
        expect(fake.$transaction).not.toHaveBeenCalled();
        for (const table of [fake.client, fake.project]) {
          expect(table.createMany).not.toHaveBeenCalled();
          expect(table.update).not.toHaveBeenCalled();
          expect(table.updateMany).not.toHaveBeenCalled();
        }
        expect(fake.client.rows).toEqual(clientsBefore);
        expect(fake.project.rows).toEqual(projectsBefore);
      });

      it('throws at the cap when Apptivo does not report countOfRecords', async () => {
        (global.fetch as jest.Mock).mockResolvedValue({
          ok: true,
          json: () => Promise.resolve({ data: workOrders(500) }),
        });

        await expect(syncService.syncWorkOrdersFromApptivo(ORG)).rejects.toThrow('an unknown number of records not fetched');
        expect(fake.$transaction).not.toHaveBeenCalled();
      });

      it('succeeds when the last full page at the cap holds every record, and logs pages and records', async () => {
        const log = jest.spyOn(syncService['logger'], 'log').mockImplementation(() => undefined);
        mockPagedWorkOrdersResponse(workOrders(1000));

        const result = await syncService.syncWorkOrdersFromApptivo(ORG);

        expect(result).toMatchObject({ synced: 1000, created: 1000 });
        expect(global.fetch).toHaveBeenCalledTimes(MAX_PAGES);
        expect(log).toHaveBeenCalledWith('Fetched 1000 Apptivo work orders in 2 page(s) (countOfRecords: 1000).');
      });
    });

    it('throws HttpException when fetch fails, before opening a transaction', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({ ok: false });

      await expect(syncService.syncWorkOrdersFromApptivo(ORG)).rejects.toThrow(HttpException);
      expect(fake.$transaction).not.toHaveBeenCalled();
    });

    it('throws HttpException on network error', async () => {
      (global.fetch as jest.Mock).mockRejectedValue(new Error('Network error'));

      await expect(syncService.syncWorkOrdersFromApptivo(ORG)).rejects.toThrow(HttpException);
    });

    it('throws HttpException when response is not an array', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({ data: 'not-an-array' }),
      });

      await expect(syncService.syncWorkOrdersFromApptivo(ORG)).rejects.toThrow(HttpException);
    });
  });
});
