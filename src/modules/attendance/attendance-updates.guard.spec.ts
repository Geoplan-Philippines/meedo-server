import { INestApplication, SetMetadata } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AttendanceController } from './attendance.controller';
import { AttendanceService } from './attendance.service';
import { AttendanceUpdatesGuard } from './attendance-updates.guard';
import { AttendanceUpdatesService } from './attendance-updates.service';
import { BiometricSyncService } from './biometrics/biometric-sync.service';
import { PrismaService } from '../../core/database/prisma.service';
import { ScheduleResolverService } from '../settings/attendance/assignments/resolver/schedule-resolver.service';

jest.mock('@thallesp/nestjs-better-auth', () => ({
  ...jest.requireActual<Record<string, unknown>>('@thallesp/nestjs-better-auth'),
  OptionalAuth: () => SetMetadata('OPTIONAL', true),
}));

describe('attendance SSE handshake', () => {
  let app: INestApplication;
  const stream = jest.fn();
  const member = { findFirst: jest.fn() };
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [AttendanceController],
      providers: [AttendanceService, AttendanceUpdatesGuard,
        { provide: PrismaService, useValue: { member } },
        { provide: ScheduleResolverService, useValue: {} },
        { provide: AttendanceUpdatesService, useValue: { stream } },
        { provide: BiometricSyncService, useValue: {} },
      ],
    }).compile();
    app = module.createNestApplication();
    // Supply test request identities; production identities are supplied by Better Auth.
    app.use((req: { headers: Record<string, string>; user?: { id: string }; session?: object }, _res: unknown, next: () => void) => {
      if (req.headers['test-user']) req.user = { id: req.headers['test-user'] };
      if (req.headers['test-org']) req.session = { session: { activeOrganizationId: req.headers['test-org'] } };
      next();
    });
    await app.init();
  });
  beforeEach(() => { jest.resetAllMocks(); });
  afterAll(async () => { await app.close(); });
  it.each([
    { user: '', org: '', membership: null },
    { user: 'a', org: '', membership: null },
    { user: 'a', org: 'org', membership: null },
    { user: 'a', org: 'org', membership: { role: '' } },
  ])('returns HTTP 403 before SSE headers for invalid scope %j', async ({ user, org, membership }) => {
    member.findFirst.mockResolvedValue(membership);
    const response = await request(app.getHttpServer() as Parameters<typeof request>[0])
      .get('/attendance/updates').set('Accept', 'text/event-stream').set('test-user', user).set('test-org', org);
    expect(response.status).toBe(403);
    expect(response.headers['content-type']).not.toContain('text/event-stream');
    expect(stream).not.toHaveBeenCalled();
  });
});
