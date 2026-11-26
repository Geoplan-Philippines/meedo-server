import { Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../../../core/database/prisma.service';
import { requireCrmMembership } from '../crm-membership';
import { displayPrefix, generateIntegrationKey, hashSecret } from './secrets';

@Injectable()
export class IntegrationKeysService {
  constructor(private readonly prisma: PrismaService) {}

  async getIntegrationKey(organizationId: string, userId: string) {
    await requireCrmMembership(this.prisma, organizationId, userId);
    const record = await this.prisma.integrationKey.findUnique({ where: { organizationId } });
    if (!record) throw new NotFoundException('No integration key for this organization.');
    return { prefix: record.prefix, createdAt: record.createdAt };
  }

  async rotateIntegrationKey(organizationId: string, userId: string) {
    await requireCrmMembership(this.prisma, organizationId, userId, { admin: true });
    const key = generateIntegrationKey();
    const data = { keyHash: hashSecret(key), prefix: displayPrefix(key) };
    const record = await this.prisma.integrationKey.upsert({
      where: { organizationId },
      create: { organizationId, ...data },
      update: data,
    });
    return { key, prefix: record.prefix, createdAt: record.createdAt };
  }

  async revokeIntegrationKey(organizationId: string, userId: string) {
    await requireCrmMembership(this.prisma, organizationId, userId, { admin: true });
    await this.prisma.integrationKey.deleteMany({ where: { organizationId } });
    return { revoked: true };
  }
}
