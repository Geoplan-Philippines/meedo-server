import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';

import { PrismaService } from '../../../core/database/prisma.service';
import { IntegrationKeyGuard } from './integration-key.guard';
import { generateIntegrationKey, hashSecret } from './secrets';

function context(headers: Record<string, string>, orgSlug: string): ExecutionContext {
  const request = { headers, params: { orgSlug }, integrationOrganization: undefined };
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as ExecutionContext;
}

describe('IntegrationKeyGuard', () => {
  const prisma = {
    integrationKey: { findUnique: jest.fn() },
  };
  const guard = new IntegrationKeyGuard(prisma as unknown as PrismaService);
  const key = generateIntegrationKey();
  const organization = { id: 'org-a', slug: 'geoplan-philippines-inc' };

  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('rejects a missing header', async () => {
    await expect(guard.canActivate(context({}, 'geoplan-philippines-inc'))).rejects.toThrow(UnauthorizedException);
  });

  it('rejects an invalid key', async () => {
    prisma.integrationKey.findUnique.mockResolvedValue(null);
    await expect(
      guard.canActivate(context({ 'x-integration-key': key }, 'geoplan-philippines-inc')),
    ).rejects.toThrow(UnauthorizedException);
    expect(prisma.integrationKey.findUnique).toHaveBeenCalledWith({
      where: { keyHash: hashSecret(key) },
      include: { organization: true },
    });
  });

  it('rejects a key that belongs to a different organization slug', async () => {
    prisma.integrationKey.findUnique.mockResolvedValue({ keyHash: hashSecret(key), organization });
    await expect(
      guard.canActivate(context({ 'x-integration-key': key }, 'other-org')),
    ).rejects.toThrow(ForbiddenException);
  });

  it('attaches the organization when the key matches the URL slug', async () => {
    prisma.integrationKey.findUnique.mockResolvedValue({ keyHash: hashSecret(key), organization });
    const ctx = context({ 'x-integration-key': key }, 'geoplan-philippines-inc');
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(ctx.switchToHttp().getRequest().integrationOrganization).toBe(organization);
  });
});
