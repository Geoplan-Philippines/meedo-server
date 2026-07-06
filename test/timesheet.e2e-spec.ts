jest.mock('@thallesp/nestjs-better-auth', () => {
  const { createParamDecorator } = jest.requireActual('@nestjs/common');
  return {
    Session: createParamDecorator((_data: unknown, ctx: import('@nestjs/common').ExecutionContext) => ctx.switchToHttp().getRequest().session),
  };
});

import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';

import { TimesheetController } from '../src/modules/timekeeping/timesheet/timesheet.controller';
import { TimesheetService } from '../src/modules/timekeeping/timesheet/timesheet.service';

describe('Timesheet smoke flow (e2e)', () => {
  let app: INestApplication<App>;

  const timesheetService = {
    getEntries: jest.fn(),
    createEntry: jest.fn(),
    submitWeek: jest.fn(),
    getSummary: jest.fn(),
    bulkApproveEntries: jest.fn(),
    lockPeriod: jest.fn(),
    getPeriodLock: jest.fn(),
    exportTimesheet: jest.fn(),
    unlockPeriod: jest.fn(),
    getProjects: jest.fn(),
    updateEntry: jest.fn(),
    deleteEntry: jest.fn(),
    bulkRejectEntries: jest.fn(),
    getAuditLogs: jest.fn(),
  };

  beforeEach(async () => {
    jest.resetAllMocks();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [TimesheetController],
      providers: [{ provide: TimesheetService, useValue: timesheetService }],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.use((req: { session?: unknown }, _res: unknown, next: () => void) => {
      req.session = {
        session: { activeOrganizationId: 'org-1' },
        user: { id: 'user-1', email: 'member@geoplanph.com' },
      };
      next();
    });
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('covers employee submit and owner approve, lock, export, unlock route flow', async () => {
    timesheetService.createEntry.mockResolvedValue({ id: 'entry-1', status: 'DRAFT' });
    timesheetService.submitWeek.mockResolvedValue({ submittedCount: 1, entries: [{ id: 'entry-1', status: 'SUBMITTED' }] });
    timesheetService.getSummary.mockResolvedValue({ totalEmployees: 1, totalEntries: 1, employees: [] });
    timesheetService.bulkApproveEntries.mockResolvedValue({ approvedCount: 1, entries: [{ id: 'entry-1', status: 'APPROVED' }] });
    timesheetService.lockPeriod.mockResolvedValue({ id: 'lock-1', isLocked: true });
    timesheetService.getPeriodLock.mockResolvedValue({ id: 'lock-1', isLocked: true });
    timesheetService.exportTimesheet.mockResolvedValue({
      buffer: Buffer.from('xlsx-smoke'),
      filename: 'timesheet-geoplan-2026-06-22-to-2026-06-28.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    timesheetService.unlockPeriod.mockResolvedValue({ id: 'lock-1', isLocked: false, unlockReason: 'Correction window' });

    await request(app.getHttpServer())
      .post('/timekeeping/timesheet/entries')
      .send({
        projectId: '3f7d6343-5b8d-4e6f-98c7-65f47b15d55f',
        workDate: '2026-06-22',
        hours: 8,
        task: 'Inspection work',
      })
      .expect(201)
      .expect(({ body }) => expect(body.id).toBe('entry-1'));

    await request(app.getHttpServer())
      .post('/timekeeping/timesheet/entries/submit-week')
      .send({ periodStart: '2026-06-22', periodEnd: '2026-06-28' })
      .expect(201)
      .expect(({ body }) => expect(body.submittedCount).toBe(1));

    await request(app.getHttpServer())
      .get('/timekeeping/timesheet/summary?periodStart=2026-06-22&periodEnd=2026-06-28')
      .expect(200)
      .expect(({ body }) => expect(body.totalEmployees).toBe(1));

    await request(app.getHttpServer())
      .post('/timekeeping/timesheet/entries/bulk-approve')
      .send({ entryIds: ['4f96e8c9-98f4-4b27-a780-fb7261e55c98'] })
      .expect(201)
      .expect(({ body }) => expect(body.approvedCount).toBe(1));

    await request(app.getHttpServer())
      .post('/timekeeping/timesheet/period-lock/lock')
      .send({ periodStart: '2026-06-22', periodEnd: '2026-06-28' })
      .expect(201)
      .expect(({ body }) => expect(body.isLocked).toBe(true));

    await request(app.getHttpServer())
      .get('/timekeeping/timesheet/period-lock?periodStart=2026-06-22&periodEnd=2026-06-28')
      .expect(200)
      .expect(({ body }) => expect(body.isLocked).toBe(true));

    await request(app.getHttpServer())
      .get('/timekeeping/timesheet/export.xlsx?periodStart=2026-06-22&periodEnd=2026-06-28')
      .expect(200)
      .expect('Content-Type', /spreadsheetml/)
      .expect('Content-Disposition', /timesheet-geoplan-2026-06-22-to-2026-06-28\.xlsx/);

    await request(app.getHttpServer())
      .post('/timekeeping/timesheet/period-lock/unlock')
      .send({ periodStart: '2026-06-22', periodEnd: '2026-06-28', reason: 'Correction window' })
      .expect(201)
      .expect(({ body }) => expect(body.isLocked).toBe(false));
  });
});
