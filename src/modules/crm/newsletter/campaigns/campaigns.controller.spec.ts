import 'reflect-metadata';
import { METHOD_METADATA, PATH_METADATA, ROUTE_ARGS_METADATA } from '@nestjs/common/constants';
import { Test } from '@nestjs/testing';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { CampaignsController } from './campaigns.controller';
import { CampaignsService } from './campaigns.service';

describe('Campaign route security metadata', () => {
  const routes = ['list', 'get', 'create', 'update', 'archive', 'restore'] as const;
  it('registers exactly the six documented routes without a delete route', () => {
    expect(Reflect.getMetadata(PATH_METADATA, CampaignsController)).toBe('crm/newsletter/campaigns');
    const methods = Object.getOwnPropertyNames(CampaignsController.prototype).filter(name => name !== 'constructor');
    expect(methods.sort()).toEqual([...routes].sort());
    for (const name of routes) expect(Reflect.getMetadata(METHOD_METADATA, CampaignsController.prototype[name])).toBeDefined();
  });
  it.each(routes)('%s carries neither the real nor mocked anonymous/optional auth metadata', name => {
    for (const target of [CampaignsController, CampaignsController.prototype[name]]) {
      for (const key of ['PUBLIC', 'OPTIONAL', 'allowAnonymous']) expect(Reflect.getMetadata(key, target)).toBeUndefined();
    }
    const args: Record<string, unknown> = Reflect.getMetadata(ROUTE_ARGS_METADATA, CampaignsController, name) as Record<string, unknown>;
    // Both custom identity/organization parameter decorators must be present.
    expect(Object.keys(args).filter(key => key.includes('__customRouteArgs__'))).toHaveLength(2);
  });
  it.each(['create', 'update', 'archive', 'restore'] as const)('%s declares owner/admin roles', name => {
    // The repository's shared Better Auth mock stores its arguments in orgRoles.
    expect(Reflect.getMetadata('orgRoles', CampaignsController.prototype[name])).toEqual([['owner', 'admin']]);
  });

  it('generates a Swagger document for all six operations and the validated DTOs', async () => {
    const module = await Test.createTestingModule({
      controllers: [CampaignsController], providers: [{ provide: CampaignsService, useValue: {} }],
    }).compile();
    const app = module.createNestApplication();
    try {
      const document = SwaggerModule.createDocument(app, new DocumentBuilder().addCookieAuth('better-auth.session_token').build());
      const operations = Object.values(document.paths).flatMap(path =>
        Object.values(path) as Array<{ security?: unknown; summary?: string; responses: unknown }>);
      expect(operations).toHaveLength(6);
      for (const operation of operations) {
        expect(operation.security).toEqual([{ cookie: [] }]);
        expect(operation.summary).toBeTruthy();
        expect(operation.responses).toHaveProperty('403');
      }
      expect(document.components?.schemas?.CreateCampaignDTO).toEqual(expect.objectContaining({ required: ['name', 'subject', 'body'] }));
      expect(document.components?.schemas?.CampaignDTO).toBeDefined();
    } finally { await app.close(); }
  });
});
