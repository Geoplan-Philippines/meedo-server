import 'reflect-metadata';
import { METHOD_METADATA, PATH_METADATA, ROUTE_ARGS_METADATA } from '@nestjs/common/constants';

import { SubscribersController } from './subscribers.controller';

describe('Subscriber route security metadata', () => {
  it('registers the list and public create routes', () => {
    expect(Reflect.getMetadata(PATH_METADATA, SubscribersController)).toBe('crm/newsletter/subscribers');
    expect(Reflect.getMetadata(METHOD_METADATA, SubscribersController.prototype.getAllSubscribers)).toBeDefined();
    expect(Reflect.getMetadata(METHOD_METADATA, SubscribersController.prototype.createSubscriber)).toBeDefined();
  });

  it('requires login and an active organization on the list', () => {
    for (const target of [SubscribersController, SubscribersController.prototype.getAllSubscribers]) {
      for (const key of ['PUBLIC', 'OPTIONAL', 'allowAnonymous']) {
        expect(Reflect.getMetadata(key, target)).toBeUndefined();
      }
    }
    const args: Record<string, unknown> = Reflect.getMetadata(ROUTE_ARGS_METADATA, SubscribersController, 'getAllSubscribers') as Record<string, unknown>;
    expect(Object.keys(args).filter((key) => key.includes('__customRouteArgs__'))).toHaveLength(2);
  });

  it('keeps create anonymous for the website form', () => {
    const target = SubscribersController.prototype.createSubscriber;
    expect(
      Reflect.getMetadata('allowAnonymous', target) === true || Reflect.getMetadata('PUBLIC', target) === true,
    ).toBe(true);
  });
});
