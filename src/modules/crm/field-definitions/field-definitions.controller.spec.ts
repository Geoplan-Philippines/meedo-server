import 'reflect-metadata';
import { PATH_METADATA, ROUTE_ARGS_METADATA } from '@nestjs/common/constants';

import { FieldDefinitionsController } from './field-definitions.controller';

describe('Field definition route security metadata', () => {
  const writes = ['createFieldDefinition', 'updateFieldDefinition', 'reorderFieldDefinitions', 'deleteFieldDefinition'] as const;

  it('is not anonymous', () => {
    expect(Reflect.getMetadata(PATH_METADATA, FieldDefinitionsController)).toBe('crm/field-definitions');
    for (const name of ['getFieldDefinitions', ...writes]) {
      for (const target of [FieldDefinitionsController, FieldDefinitionsController.prototype[name]]) {
        for (const key of ['PUBLIC', 'OPTIONAL', 'allowAnonymous']) {
          expect(Reflect.getMetadata(key, target)).toBeUndefined();
        }
      }
    }
  });

  it.each(writes)('%s declares owner/admin roles', (name) => {
    expect(Reflect.getMetadata('orgRoles', FieldDefinitionsController.prototype[name])).toEqual([['owner', 'admin']]);
  });

  it('binds organization and user on every handler', () => {
    for (const name of ['getFieldDefinitions', ...writes]) {
      const args: Record<string, unknown> = Reflect.getMetadata(ROUTE_ARGS_METADATA, FieldDefinitionsController, name) as Record<string, unknown>;
      expect(Object.keys(args).filter((key) => key.includes('__customRouteArgs__')).length).toBeGreaterThanOrEqual(2);
    }
  });
});
