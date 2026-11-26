import 'reflect-metadata';
import { GUARDS_METADATA, METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';

import { IntegrationKeyGuard } from '../integration/integration-key.guard';
import { PublicSubmitController } from './public-submit.controller';

describe('PublicSubmitController', () => {
  it('is anonymous, key-guarded, and mounted under public/:orgSlug', () => {
    expect(Reflect.getMetadata(PATH_METADATA, PublicSubmitController)).toBe('public/:orgSlug');
    expect(
      Reflect.getMetadata('allowAnonymous', PublicSubmitController) === true
      || Reflect.getMetadata('PUBLIC', PublicSubmitController) === true,
    ).toBe(true);
    for (const name of ['submitLead', 'submitSubscriber'] as const) {
      const target = PublicSubmitController.prototype[name];
      expect(
        Reflect.getMetadata('allowAnonymous', target) === true
        || Reflect.getMetadata('PUBLIC', target) === true,
      ).toBe(true);
    }
    expect(Reflect.getMetadata(GUARDS_METADATA, PublicSubmitController)).toEqual([IntegrationKeyGuard]);
    expect(Reflect.getMetadata(METHOD_METADATA, PublicSubmitController.prototype.submitLead)).toBeDefined();
    expect(Reflect.getMetadata(METHOD_METADATA, PublicSubmitController.prototype.submitSubscriber)).toBeDefined();
  });
});
