jest.mock('@thallesp/nestjs-better-auth', () => {
  const { SetMetadata } = jest.requireActual('@nestjs/common');
  return {
    AllowAnonymous: () => SetMetadata('allowAnonymous', true),
    OrgRoles: (...roles: string[]) => SetMetadata('orgRoles', roles),
  };
});

import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import request from 'supertest';
import { App } from 'supertest/types';

import { ResponseInteceptor } from '../src/common/interceptors/response.interceptors';
import { PrismaService } from '../src/core/database/prisma.service';
import { LEAD_SYSTEM_FIELDS, SUBSCRIBER_SYSTEM_FIELDS } from '../src/modules/crm/field-definitions/system-fields';
import { CrmEventsService } from '../src/modules/crm/integration/crm-events.service';
import { IntegrationDocsController } from '../src/modules/crm/integration/integration-docs.controller';
import { IntegrationKeyGuard } from '../src/modules/crm/integration/integration-key.guard';
import { generateIntegrationKey, hashSecret } from '../src/modules/crm/integration/secrets';
import { PublicSubmitController } from '../src/modules/crm/public/public-submit.controller';
import { PublicSubmitService } from '../src/modules/crm/public/public-submit.service';

const org = { id: 'org-a', slug: 'geoplan-philippines-inc' };
const otherOrg = { id: 'org-b', slug: 'other-org' };
const toView = (field: (typeof LEAD_SYSTEM_FIELDS)[number]) => ({
  key: field.key,
  type: field.type,
  options: field.options,
  isRequired: field.isRequired,
  isReadOnly: field.isReadOnly,
});
const leadFields = LEAD_SYSTEM_FIELDS.map(toView);
const subscriberFields = SUBSCRIBER_SYSTEM_FIELDS.map(toView);
const leadBody = {
  values: {
    firstName: 'Ada',
    lastName: 'Lovelace',
    email: 'ada@example.com',
    message: 'Hello from the website',
  },
};

function applyPublicApi(app: INestApplication) {
  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  app.enableCors((req, callback) => {
    const path = `${req.originalUrl ?? ''} ${req.url ?? ''} ${req.path ?? ''}`;
    const isPublicApi = path.includes('/public/');
    if (isPublicApi) {
      callback(null, {
        origin: '*',
        methods: ['POST', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'x-integration-key'],
        credentials: false,
      });
      return;
    }
    callback(null, { origin: ['http://localhost:4200'], credentials: true });
  });
}

describe('Public submit (e2e)', () => {
  let app: INestApplication<App>;
  const validKey = generateIntegrationKey();
  const otherKey = generateIntegrationKey();
  const prisma = {
    integrationKey: { findUnique: jest.fn() },
    fieldDefinition: { findMany: jest.fn() },
    publicSubmitCounter: { upsert: jest.fn() },
    lead: { create: jest.fn() },
    newsletterSubscriber: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
  };
  const events = { enqueue: jest.fn() };

  function stubKeyLookup() {
    events.enqueue.mockResolvedValue(undefined);
    prisma.publicSubmitCounter.upsert.mockResolvedValue({ count: 1 });
    prisma.fieldDefinition.findMany.mockResolvedValue(leadFields);
    prisma.lead.create.mockResolvedValue({ id: 'lead-1' });
    prisma.integrationKey.findUnique.mockImplementation(({ where }: { where: { keyHash: string } }) => {
      if (where.keyHash === hashSecret(validKey)) {
        return Promise.resolve({ keyHash: where.keyHash, organization: org });
      }
      if (where.keyHash === hashSecret(otherKey)) {
        return Promise.resolve({ keyHash: where.keyHash, organization: otherOrg });
      }
      return Promise.resolve(null);
    });
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [PublicSubmitController, IntegrationDocsController],
      providers: [
        PublicSubmitService,
        IntegrationKeyGuard,
        { provide: PrismaService, useValue: prisma },
        { provide: CrmEventsService, useValue: events },
        {
          provide: APP_PIPE,
          useValue: new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
        },
        { provide: APP_INTERCEPTOR, useClass: ResponseInteceptor },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    applyPublicApi(app);
    await app.init();
  });

  beforeEach(() => {
    jest.resetAllMocks();
    stubKeyLookup();
  });

  afterAll(async () => {
    await app.close();
  });

  it('creates a lead with a valid key', async () => {
    const response = await request(app.getHttpServer())
      .post(`/api/v1/public/${org.slug}/leads`)
      .set('x-integration-key', validKey)
      .send(leadBody)
      .expect(201);
    expect(response.body.data).toEqual({ id: 'lead-1' });
    expect(prisma.lead.create).toHaveBeenCalled();
  });

  it('creates a subscriber with a valid key', async () => {
    prisma.fieldDefinition.findMany.mockResolvedValue(subscriberFields);
    prisma.newsletterSubscriber.findFirst.mockResolvedValue(null);
    prisma.newsletterSubscriber.create.mockResolvedValue({ id: 'sub-1' });
    const response = await request(app.getHttpServer())
      .post(`/api/v1/public/${org.slug}/subscribers`)
      .set('x-integration-key', validKey)
      .send({ values: { email: 'ada@example.com', name: 'Ada Lovelace' } })
      .expect(201);
    expect(response.body.data).toEqual({ id: 'sub-1' });
    expect(prisma.newsletterSubscriber.create).toHaveBeenCalled();
  });

  it('rejects an invalid key', async () => {
    await request(app.getHttpServer())
      .post(`/api/v1/public/${org.slug}/leads`)
      .set('x-integration-key', 'mdo_pk_not-a-real-key')
      .send(leadBody)
      .expect(401);
    expect(prisma.lead.create).not.toHaveBeenCalled();
  });

  it('rejects a key that belongs to a different organization', async () => {
    await request(app.getHttpServer())
      .post(`/api/v1/public/${org.slug}/leads`)
      .set('x-integration-key', otherKey)
      .send(leadBody)
      .expect(403);
    expect(prisma.lead.create).not.toHaveBeenCalled();
  });

  it('accepts a honeypot without creating a record', async () => {
    const response = await request(app.getHttpServer())
      .post(`/api/v1/public/${org.slug}/leads`)
      .set('x-integration-key', validKey)
      .send({ ...leadBody, honeypot: 'http://spam.test' })
      .expect(201);
    expect(response.body.data.id).toEqual(expect.any(String));
    expect(prisma.lead.create).not.toHaveBeenCalled();
    expect(prisma.publicSubmitCounter.upsert).not.toHaveBeenCalled();
  });

  it('opens CORS on public submit and not on docs', async () => {
    const publicPreflight = await request(app.getHttpServer())
      .options(`/api/v1/public/${org.slug}/leads`)
      .set('Origin', 'https://geoplan.com.ph')
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'content-type,x-integration-key');
    expect([200, 204]).toContain(publicPreflight.status);
    expect(publicPreflight.headers['access-control-allow-origin']).toBe('*');
    expect(publicPreflight.headers['access-control-allow-credentials']).toBeUndefined();

    const docs = await request(app.getHttpServer())
      .get('/api/v1/docs/integration.md')
      .set('Origin', 'https://geoplan.com.ph')
      .expect(200);
    expect(docs.headers['content-type']).toMatch(/text\/plain/);
    expect(docs.headers['cache-control']).toContain('max-age=60');
    expect(docs.text).toContain('Paste this to your AI agent');
    expect(docs.text).toContain('MEEDO_INTEGRATION_KEY');
    expect(docs.text).toContain('X-Meedo-Signature: sha256=');
    expect(docs.headers['access-control-allow-origin']).not.toBe('*');
  });
});

describe('Public submit throttle (e2e)', () => {
  let app: INestApplication<App>;
  const validKey = generateIntegrationKey();
  const prisma = {
    integrationKey: { findUnique: jest.fn() },
    fieldDefinition: { findMany: jest.fn() },
    publicSubmitCounter: { upsert: jest.fn() },
    lead: { create: jest.fn() },
    newsletterSubscriber: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
  };

  beforeAll(async () => {
    prisma.integrationKey.findUnique.mockResolvedValue({
      keyHash: hashSecret(validKey),
      organization: org,
    });
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 100 }]),
      ],
      controllers: [PublicSubmitController],
      providers: [
        PublicSubmitService,
        IntegrationKeyGuard,
        { provide: PrismaService, useValue: prisma },
        { provide: CrmEventsService, useValue: { enqueue: jest.fn() } },
        { provide: APP_GUARD, useClass: ThrottlerGuard },
        {
          provide: APP_PIPE,
          useValue: new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
        },
        { provide: APP_INTERCEPTOR, useClass: ResponseInteceptor },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    applyPublicApi(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('throttles a tenth-plus request from the same IP', async () => {
    for (let i = 0; i < 10; i += 1) {
      await request(app.getHttpServer())
        .post(`/api/v1/public/${org.slug}/leads`)
        .set('x-integration-key', validKey)
        .send({ ...leadBody, honeypot: 'bot' })
        .expect(201);
    }
    await request(app.getHttpServer())
      .post(`/api/v1/public/${org.slug}/leads`)
      .set('x-integration-key', validKey)
      .send({ ...leadBody, honeypot: 'bot' })
      .expect(429);
  });
});
