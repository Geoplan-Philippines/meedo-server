import { ForbiddenException } from '@nestjs/common';

import { PrismaService } from '../../../core/database/prisma.service';
import { IntegrationKeysService } from './integration-keys.service';
import { hashSecret } from './secrets';

const org = 'org-a';
const user = 'user-a';

describe('IntegrationKeysService', () => {
  const prisma = {
    member: { findUnique: jest.fn() },
    integrationKey: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
      deleteMany: jest.fn(),
    },
  };
  const service = new IntegrationKeysService(prisma as unknown as PrismaService);

  beforeEach(() => {
    jest.resetAllMocks();
    prisma.member.findUnique.mockResolvedValue({ id: 'member-a', role: 'admin' });
  });

  it('returns only the prefix, never the full key', async () => {
    prisma.integrationKey.findUnique.mockResolvedValue({
      prefix: 'mdo_pk_abcde',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      keyHash: 'deadbeef',
    });
    await expect(service.getIntegrationKey(org, user)).resolves.toEqual({
      prefix: 'mdo_pk_abcde',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    });
  });

  it('stores a SHA-256 hash and prefix, and returns the full key once on rotate', async () => {
    prisma.integrationKey.upsert.mockImplementation(async ({ create }) => ({
      prefix: create.prefix,
      createdAt: new Date('2026-01-02T00:00:00.000Z'),
      keyHash: create.keyHash,
    }));
    const first = await service.rotateIntegrationKey(org, user);
    expect(first.key.startsWith('mdo_pk_')).toBe(true);
    expect(first.prefix).toBe(first.key.slice(0, 12));
    expect(prisma.integrationKey.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: {
        organizationId: org,
        keyHash: hashSecret(first.key),
        prefix: first.prefix,
      },
      update: {
        keyHash: hashSecret(first.key),
        prefix: first.prefix,
      },
    }));
    expect(prisma.integrationKey.upsert.mock.calls[0][0].create.keyHash).not.toBe(first.key);
    expect(prisma.integrationKey.upsert.mock.calls[0][0].create.keyHash).toHaveLength(64);

    const second = await service.rotateIntegrationKey(org, user);
    expect(second.key).not.toBe(first.key);
    expect(hashSecret(second.key)).not.toBe(hashSecret(first.key));
  });

  it('revokes by deleting the stored hash', async () => {
    await expect(service.revokeIntegrationKey(org, user)).resolves.toEqual({ revoked: true });
    expect(prisma.integrationKey.deleteMany).toHaveBeenCalledWith({ where: { organizationId: org } });
  });

  it('rejects rotate from a non-admin member', async () => {
    prisma.member.findUnique.mockResolvedValue({ id: 'member-a', role: 'member' });
    await expect(service.rotateIntegrationKey(org, user)).rejects.toThrow(ForbiddenException);
    expect(prisma.integrationKey.upsert).not.toHaveBeenCalled();
  });
});
