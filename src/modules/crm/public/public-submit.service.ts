import { BadRequestException, HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { FieldCollection, Prisma, SubscriberStatus } from '@prisma/client';
import { randomUUID } from 'node:crypto';

import { env } from '../../../core/config/env.config';
import { PrismaService } from '../../../core/database/prisma.service';
import { generateUnsubscribeToken, normalizeEmail } from '../crm.constants';
import { formatFieldValueErrors, parseFieldValues } from '../field-definitions/parse-field-values';
import { CrmEventsService } from '../integration/crm-events.service';
import { asValueMap, splitLeadValues } from '../leads/lead-record';
import { hideUnsubscribeToken, splitSubscriberValues } from '../newsletter/subscribers/subscriber-record';

@Injectable()
export class PublicSubmitService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: CrmEventsService,
  ) {}

  async submitLead(organizationId: string, body: { values: Record<string, unknown>; honeypot?: string }) {
    if (this.isHoneypot(body.honeypot)) return { id: randomUUID() };
    await this.consumeDailyCap(organizationId);
    const parsed = await this.parseValues(organizationId, FieldCollection.lead, body.values);
    const { columns, custom } = splitLeadValues(parsed, {});
    const lead = await this.prisma.lead.create({
      data: {
        organizationId,
        firstName: String(columns.firstName ?? ''),
        lastName: String(columns.lastName ?? ''),
        email: normalizeEmail(String(columns.email ?? '')),
        company: (columns.company as string | null | undefined) ?? null,
        phoneNumber: (columns.phoneNumber as string | null | undefined) ?? null,
        message: String(columns.message ?? ''),
        source: (columns.source as string | null | undefined) ?? null,
        values: custom as Prisma.InputJsonValue,
      },
    });
    await this.events.enqueue(organizationId, 'lead.created', { id: lead.id, organizationId });
    return { id: lead.id };
  }

  async submitSubscriber(organizationId: string, body: { values: Record<string, unknown>; honeypot?: string }) {
    if (this.isHoneypot(body.honeypot)) return { id: randomUUID() };
    await this.consumeDailyCap(organizationId);
    const parsed = await this.parseValues(organizationId, FieldCollection.subscriber, body.values);
    const { columns, custom } = splitSubscriberValues(parsed, {});
    const email = normalizeEmail(String(columns.email ?? ''));
    const existing = await this.prisma.newsletterSubscriber.findFirst({
      where: { organizationId, email },
    });
    if (existing?.status === SubscriberStatus.SUBSCRIBED) {
      return { id: existing.id };
    }
    if (existing?.status === SubscriberStatus.UNSUBSCRIBED) {
      const updated = await this.prisma.newsletterSubscriber.update({
        where: { id: existing.id },
        data: {
          ...columns,
          email,
          status: SubscriberStatus.SUBSCRIBED,
          unsubscribedAt: null,
          consentAt: new Date(),
          isArchived: false,
          values: { ...asValueMap(existing.values), ...custom } as Prisma.InputJsonValue,
        },
      });
      await this.events.enqueue(organizationId, 'subscriber.created', { id: updated.id, organizationId });
      return { id: hideUnsubscribeToken(updated).id };
    }
    const created = await this.prisma.newsletterSubscriber.create({
      data: {
        organizationId,
        email,
        name: (columns.name as string | null | undefined) ?? null,
        source: (columns.source as string | null | undefined) ?? null,
        unsubscribeToken: generateUnsubscribeToken(),
        consentAt: new Date(),
        values: custom as Prisma.InputJsonValue,
      },
    });
    await this.events.enqueue(organizationId, 'subscriber.created', { id: created.id, organizationId });
    return { id: created.id };
  }

  private isHoneypot(honeypot?: string): boolean {
    return typeof honeypot === 'string' && honeypot.trim() !== '';
  }

  private async consumeDailyCap(organizationId: string): Promise<void> {
    const day = new Date(Date.UTC(
      new Date().getUTCFullYear(),
      new Date().getUTCMonth(),
      new Date().getUTCDate(),
    ));
    const row = await this.prisma.publicSubmitCounter.upsert({
      where: { organizationId_day: { organizationId, day } },
      create: { organizationId, day, count: 1 },
      update: { count: { increment: 1 } },
    });
    if (row.count > env.PUBLIC_SUBMIT_DAILY_CAP) {
      throw new HttpException('Daily submit cap reached.', HttpStatus.TOO_MANY_REQUESTS);
    }
  }

  private async parseValues(
    organizationId: string,
    collection: FieldCollection,
    values: unknown,
  ): Promise<Record<string, unknown>> {
    const definitions = await this.prisma.fieldDefinition.findMany({ where: { organizationId, collection } });
    const result = parseFieldValues(definitions, values, { mode: 'create' });
    if (!result.ok) throw new BadRequestException(formatFieldValueErrors(result.errors));
    return result.normalized;
  }
}
