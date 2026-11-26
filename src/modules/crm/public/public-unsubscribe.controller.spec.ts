import 'reflect-metadata';
import { PATH_METADATA } from '@nestjs/common/constants';
import { Test } from '@nestjs/testing';

import { SubscribersService } from '../newsletter/subscribers/subscribers.service';
import { PublicUnsubscribeController, UNSUBSCRIBE_CONFIRMATION_HTML } from './public-unsubscribe.controller';

describe('PublicUnsubscribeController', () => {
  it('is anonymous on GET and POST', () => {
    expect(Reflect.getMetadata(PATH_METADATA, PublicUnsubscribeController)).toBe('public/unsubscribe');
    for (const name of ['unsubscribeGet', 'unsubscribePost'] as const) {
      const target = PublicUnsubscribeController.prototype[name];
      expect(
        Reflect.getMetadata('allowAnonymous', target) === true || Reflect.getMetadata('PUBLIC', target) === true,
      ).toBe(true);
    }
  });

  it('returns the same confirmation for a valid token and a missing token', async () => {
    const subscribers = { unsubscribeByToken: jest.fn().mockResolvedValue(undefined) };
    const module = await Test.createTestingModule({
      controllers: [PublicUnsubscribeController],
      providers: [{ provide: SubscribersService, useValue: subscribers }],
    }).compile();
    const controller = module.get(PublicUnsubscribeController);
    await expect(controller.unsubscribeGet('ok')).resolves.toBe(UNSUBSCRIBE_CONFIRMATION_HTML);
    await expect(controller.unsubscribeGet('missing')).resolves.toBe(UNSUBSCRIBE_CONFIRMATION_HTML);
    expect(subscribers.unsubscribeByToken).toHaveBeenCalledTimes(2);
  });
});
