import { BadRequestException, ForbiddenException } from '@nestjs/common';

import { PrismaService } from '../../../core/database/prisma.service';
import { FieldDefinitionsService } from './field-definitions.service';

const org = 'org-a';
const user = 'user-a';
const customField = {
  id: 'field-1',
  organizationId: org,
  collection: 'lead' as const,
  key: 'budget',
  label: 'Budget',
  type: 'number' as const,
  options: [],
  isRequired: false,
  isReadOnly: false,
  isSystem: false,
  position: 10,
  createdAt: new Date(),
  updatedAt: new Date(),
};
const systemField = { ...customField, id: 'field-sys', key: 'email', isSystem: true, type: 'text' as const };

describe('FieldDefinitionsService', () => {
  const prisma = {
    member: { findUnique: jest.fn() },
    fieldDefinition: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    $transaction: jest.fn(),
    $executeRaw: jest.fn(),
  };
  const service = new FieldDefinitionsService(prisma as unknown as PrismaService);

  beforeEach(() => {
    jest.resetAllMocks();
    prisma.member.findUnique.mockResolvedValue({ id: 'member-a', role: 'admin' });
    prisma.fieldDefinition.findMany.mockResolvedValue([customField]);
    prisma.fieldDefinition.findFirst.mockResolvedValue(customField);
    prisma.fieldDefinition.create.mockResolvedValue(customField);
    prisma.$transaction.mockImplementation(async (arg: unknown) => {
      if (typeof arg === 'function') return arg(prisma);
      return Promise.all(arg as Promise<unknown>[]);
    });
  });

  it('rejects a member write before changing fields', async () => {
    prisma.member.findUnique.mockResolvedValue({ id: 'member-a', role: 'member' });
    await expect(service.createFieldDefinition({
      collection: 'lead',
      key: 'budget',
      label: 'Budget',
      type: 'number',
    }, org, user)).rejects.toThrow(ForbiddenException);
    expect(prisma.fieldDefinition.create).not.toHaveBeenCalled();
  });

  it('refuses to edit or delete a system field', async () => {
    prisma.fieldDefinition.findFirst.mockResolvedValue(systemField);
    await expect(service.updateFieldDefinition(systemField.id, { label: 'Nope' }, org, user))
      .rejects.toThrow(BadRequestException);
    await expect(service.deleteFieldDefinition(systemField.id, org, user))
      .rejects.toThrow(BadRequestException);
    expect(prisma.fieldDefinition.delete).not.toHaveBeenCalled();
  });

  it('strips custom values from leads when a lead field is deleted', async () => {
    await service.deleteFieldDefinition(customField.id, org, user);
    expect(prisma.fieldDefinition.delete).toHaveBeenCalledWith({ where: { id: customField.id } });
  });
});
