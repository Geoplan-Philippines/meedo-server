import 'reflect-metadata';
import { PATH_METADATA } from '@nestjs/common/constants';

import { IntegrationKeysController } from './integration-keys.controller';

describe('IntegrationKeysController', () => {
  it('keeps create/rotate/revoke admin-only and GET authenticated', () => {
    expect(Reflect.getMetadata(PATH_METADATA, IntegrationKeysController)).toBe('settings/website/integration-key');
    expect(Reflect.getMetadata('orgRoles', IntegrationKeysController.prototype.rotateIntegrationKey)).toEqual([
      ['owner', 'admin'],
    ]);
    expect(Reflect.getMetadata('orgRoles', IntegrationKeysController.prototype.revokeIntegrationKey)).toEqual([
      ['owner', 'admin'],
    ]);
    expect(Reflect.getMetadata('orgRoles', IntegrationKeysController.prototype.getIntegrationKey)).toBeUndefined();
    for (const name of ['getIntegrationKey', 'rotateIntegrationKey', 'revokeIntegrationKey'] as const) {
      for (const target of [IntegrationKeysController, IntegrationKeysController.prototype[name]]) {
        for (const key of ['PUBLIC', 'OPTIONAL', 'allowAnonymous']) {
          expect(Reflect.getMetadata(key, target)).toBeUndefined();
        }
      }
    }
  });
});
