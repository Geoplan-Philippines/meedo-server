import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';

import { PrismaService } from '../../../core/database/prisma.service';
import { hashSecret } from './secrets';

@Injectable()
export class IntegrationKeyGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const key = request.headers['x-integration-key'];
    const orgSlug = request.params?.orgSlug as string | undefined;
    if (typeof key !== 'string' || !key) {
      throw new UnauthorizedException('Missing x-integration-key.');
    }
    const record = await this.prisma.integrationKey.findUnique({
      where: { keyHash: hashSecret(key) },
      include: { organization: true },
    });
    if (!record) {
      throw new UnauthorizedException('Invalid integration key.');
    }
    if (!orgSlug || record.organization.slug !== orgSlug) {
      throw new ForbiddenException('Integration key does not match this organization.');
    }
    request.integrationOrganization = record.organization;
    return true;
  }
}
