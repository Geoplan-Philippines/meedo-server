import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';

import { PrismaService } from '../../../core/database/prisma.service';
import type { WebhookEventName } from './webhook-events';

@Injectable()
export class CrmEventsService {
  private readonly logger = new Logger(CrmEventsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async enqueue(
    organizationId: string,
    event: WebhookEventName,
    data: Record<string, unknown>,
  ): Promise<void> {
    try {
      const endpoints = await this.prisma.webhookEndpoint.findMany({
        where: { organizationId, isEnabled: true, events: { has: event } },
        select: { id: true },
      });
      if (!endpoints.length) return;
      const payload = {
        id: randomUUID(),
        type: event,
        createdAt: new Date().toISOString(),
        data,
      };
      await this.prisma.webhookDelivery.createMany({
        data: endpoints.map((endpoint) => ({
          endpointId: endpoint.id,
          organizationId,
          event,
          payload: payload as Prisma.InputJsonValue,
        })),
      });
    } catch (error) {
      this.logger.warn(`Failed to enqueue ${event} for organization ${organizationId}.`);
    }
  }
}
