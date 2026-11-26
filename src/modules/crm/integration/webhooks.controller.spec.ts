import 'reflect-metadata';
import { PATH_METADATA } from '@nestjs/common/constants';

import { WebhooksController } from './webhooks.controller';

describe('WebhooksController', () => {
  it('is admin-only under settings/website/webhooks', () => {
    expect(Reflect.getMetadata(PATH_METADATA, WebhooksController)).toBe('settings/website/webhooks');
    expect(Reflect.getMetadata('orgRoles', WebhooksController)).toEqual([['owner', 'admin']]);
    for (const key of ['PUBLIC', 'OPTIONAL', 'allowAnonymous']) {
      expect(Reflect.getMetadata(key, WebhooksController)).toBeUndefined();
    }
  });
});
