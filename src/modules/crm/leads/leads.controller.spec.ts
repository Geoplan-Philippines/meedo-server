import 'reflect-metadata';
import { METHOD_METADATA, PATH_METADATA, ROUTE_ARGS_METADATA } from '@nestjs/common/constants';
import { Test } from '@nestjs/testing';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

import { LeadsController } from './leads.controller';
import { LeadsService } from './leads.service';

describe('Lead route security metadata', () => {
  const authed = [
    'getStats',
    'exportLeads',
    'createLeadManual',
    'getAllLeads',
    'getLead',
    'updateLeadValues',
    'changeLeadStatus',
    'archiveLead',
    'restoreLead',
  ] as const;
  const anonymous = ['createLead'] as const;

  it('registers the list, stats, and public create routes', () => {
    expect(Reflect.getMetadata(PATH_METADATA, LeadsController)).toBe('crm/leads');
    for (const name of [...authed, ...anonymous]) {
      expect(Reflect.getMetadata(METHOD_METADATA, LeadsController.prototype[name])).toBeDefined();
    }
  });

  it.each(authed)('%s requires login and an active organization', (name) => {
    for (const target of [LeadsController, LeadsController.prototype[name]]) {
      for (const key of ['PUBLIC', 'OPTIONAL', 'allowAnonymous']) {
        expect(Reflect.getMetadata(key, target)).toBeUndefined();
      }
    }
    const args: Record<string, unknown> = Reflect.getMetadata(ROUTE_ARGS_METADATA, LeadsController, name) as Record<string, unknown>;
    expect(Object.keys(args).filter((key) => key.includes('__customRouteArgs__')).length).toBeGreaterThanOrEqual(2);
  });

  it.each(anonymous)('%s stays anonymous for the website form', (name) => {
    const target = LeadsController.prototype[name];
    expect(
      Reflect.getMetadata('allowAnonymous', target) === true || Reflect.getMetadata('PUBLIC', target) === true,
    ).toBe(true);
  });

  it('generates a Swagger document that marks list and stats as cookie-authenticated', async () => {
    const module = await Test.createTestingModule({
      controllers: [LeadsController],
      providers: [{ provide: LeadsService, useValue: {} }],
    }).compile();
    const app = module.createNestApplication();
    try {
      const document = SwaggerModule.createDocument(app, new DocumentBuilder().addCookieAuth('better-auth.session_token').build());
      const list = document.paths['/crm/leads']?.get;
      const stats = document.paths['/crm/leads/stats']?.get;
      const create = document.paths['/crm/leads']?.post;
      expect(list?.security).toEqual([{ cookie: [] }]);
      expect(stats?.security).toEqual([{ cookie: [] }]);
      expect(create?.security ?? []).toEqual([]);
    } finally {
      await app.close();
    }
  });
});
