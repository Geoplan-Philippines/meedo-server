import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { WebhookDeliveryStatus } from '@prisma/client';

import { env } from '../../../core/config/env.config';
import { PrismaService } from '../../../core/database/prisma.service';
import { signWebhookBody, WEBHOOK_SIGNATURE_HEADER, webhookRawBody } from './secrets';
import { WEBHOOK_BACKOFF_MS, WEBHOOK_MAX_ATTEMPTS, WEBHOOK_TIMEOUT_MS } from './webhook-events';

@Injectable()
export class WebhookDeliveryProcessor {
  private readonly logger = new Logger(WebhookDeliveryProcessor.name);

  constructor(private readonly prisma: PrismaService) {}

  @Cron(CronExpression.EVERY_10_SECONDS)
  async drainOutbox(): Promise<void> {
    if (env.NODE_ENV === 'test') return;
    const due = await this.prisma.webhookDelivery.findMany({
      where: { status: WebhookDeliveryStatus.PENDING, nextAttemptAt: { lte: new Date() } },
      include: { endpoint: true },
      orderBy: { nextAttemptAt: 'asc' },
      take: 20,
    });
    for (const delivery of due) {
      await this.attempt(delivery);
    }
  }

  async attempt(delivery: {
    id: string;
    payload: unknown;
    attemptCount: number;
    endpoint: { url: string; secret: string; isEnabled: boolean };
  }): Promise<void> {
    if (!delivery.endpoint.isEnabled) {
      await this.prisma.webhookDelivery.update({
        where: { id: delivery.id },
        data: { status: WebhookDeliveryStatus.FAILED, lastError: 'Endpoint disabled' },
      });
      return;
    }
    const rawBody = webhookRawBody(delivery.payload);
    const attemptCount = delivery.attemptCount + 1;
    try {
      const response = await fetch(delivery.endpoint.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          [WEBHOOK_SIGNATURE_HEADER]: signWebhookBody(delivery.endpoint.secret, rawBody),
        },
        body: rawBody,
        signal: AbortSignal.timeout(WEBHOOK_TIMEOUT_MS),
      });
      if (response.ok) {
        await this.prisma.webhookDelivery.update({
          where: { id: delivery.id },
          data: {
            status: WebhookDeliveryStatus.DELIVERED,
            attemptCount,
            responseStatus: response.status,
            deliveredAt: new Date(),
            lastError: null,
          },
        });
        return;
      }
      await this.failAttempt(delivery.id, attemptCount, `HTTP ${response.status}`, response.status);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Webhook delivery failed';
      this.logger.warn(`Webhook delivery ${delivery.id} failed: ${message}`);
      await this.failAttempt(delivery.id, attemptCount, message);
    }
  }

  private async failAttempt(id: string, attemptCount: number, lastError: string, responseStatus?: number): Promise<void> {
    const exhausted = attemptCount >= WEBHOOK_MAX_ATTEMPTS;
    const backoff = WEBHOOK_BACKOFF_MS[Math.min(attemptCount - 1, WEBHOOK_BACKOFF_MS.length - 1)];
    await this.prisma.webhookDelivery.update({
      where: { id },
      data: {
        attemptCount,
        lastError,
        responseStatus: responseStatus ?? null,
        status: exhausted ? WebhookDeliveryStatus.FAILED : WebhookDeliveryStatus.PENDING,
        nextAttemptAt: exhausted ? new Date() : new Date(Date.now() + backoff),
      },
    });
  }
}
