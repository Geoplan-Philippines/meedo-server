import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../../core/database/prisma.service';
import { pageArgs, toPage } from '../../../common/utils/pagination.util';
import { ListQueryDTO } from '../../../common/dto/list-query.dto';
import { requireCrmMembership } from '../crm-membership';
import { CreateWebhookEndpointDTO, UpdateWebhookEndpointDTO } from './dto/webhook-endpoint.dto';
import { displayPrefix, generateWebhookSecret } from './secrets';

function assertHttpUrl(url: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new BadRequestException('url must be an http or https URL.');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new BadRequestException('url must be an http or https URL.');
  }
  return parsed.toString();
}

function withoutSecret<T extends { secret: string }>(row: T) {
  const { secret: _secret, ...rest } = row;
  return rest;
}

@Injectable()
export class WebhooksService {
  constructor(private readonly prisma: PrismaService) {}

  async listWebhookEndpoints(organizationId: string, userId: string) {
    await requireCrmMembership(this.prisma, organizationId, userId, { admin: true });
    const rows = await this.prisma.webhookEndpoint.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(withoutSecret);
  }

  async createWebhookEndpoint(body: CreateWebhookEndpointDTO, organizationId: string, userId: string) {
    await requireCrmMembership(this.prisma, organizationId, userId, { admin: true });
    const secret = generateWebhookSecret();
    const created = await this.prisma.webhookEndpoint.create({
      data: {
        organizationId,
        url: assertHttpUrl(body.url),
        secret,
        secretPrefix: displayPrefix(secret),
        events: body.events,
      },
    });
    return { ...withoutSecret(created), secret };
  }

  async getWebhookEndpoint(id: string, organizationId: string, userId: string) {
    await requireCrmMembership(this.prisma, organizationId, userId, { admin: true });
    return withoutSecret(await this.find(id, organizationId));
  }

  async updateWebhookEndpoint(
    id: string,
    body: UpdateWebhookEndpointDTO,
    organizationId: string,
    userId: string,
  ) {
    await requireCrmMembership(this.prisma, organizationId, userId, { admin: true });
    await this.find(id, organizationId);
    const updated = await this.prisma.webhookEndpoint.update({
      where: { id },
      data: {
        ...(body.url !== undefined ? { url: assertHttpUrl(body.url) } : {}),
        ...(body.events !== undefined ? { events: body.events } : {}),
        ...(body.isEnabled !== undefined ? { isEnabled: body.isEnabled } : {}),
      },
    });
    return withoutSecret(updated);
  }

  async deleteWebhookEndpoint(id: string, organizationId: string, userId: string) {
    await requireCrmMembership(this.prisma, organizationId, userId, { admin: true });
    await this.find(id, organizationId);
    await this.prisma.webhookEndpoint.delete({ where: { id } });
    return { id };
  }

  async rotateWebhookSecret(id: string, organizationId: string, userId: string) {
    await requireCrmMembership(this.prisma, organizationId, userId, { admin: true });
    await this.find(id, organizationId);
    const secret = generateWebhookSecret();
    const updated = await this.prisma.webhookEndpoint.update({
      where: { id },
      data: { secret, secretPrefix: displayPrefix(secret) },
    });
    return { ...withoutSecret(updated), secret };
  }

  async listWebhookDeliveries(id: string, query: ListQueryDTO, organizationId: string, userId: string) {
    await requireCrmMembership(this.prisma, organizationId, userId, { admin: true });
    await this.find(id, organizationId);
    const where: Prisma.WebhookDeliveryWhereInput = { endpointId: id, organizationId };
    const [data, total] = await Promise.all([
      this.prisma.webhookDelivery.findMany({
        where,
        ...pageArgs(query),
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      }),
      this.prisma.webhookDelivery.count({ where }),
    ]);
    return toPage(data, total, query);
  }

  private async find(id: string, organizationId: string) {
    const endpoint = await this.prisma.webhookEndpoint.findFirst({ where: { id, organizationId } });
    if (!endpoint) throw new NotFoundException('Webhook endpoint not found in this organization.');
    return endpoint;
  }
}
