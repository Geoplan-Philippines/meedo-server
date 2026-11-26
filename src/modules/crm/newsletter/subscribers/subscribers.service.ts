import { BadRequestException, Injectable, NotFoundException, StreamableFile } from '@nestjs/common';
import { FieldCollection, NewsletterSubscriber, Prisma, SubscriberStatus } from '@prisma/client';

import { PaginatedResponse } from '../../../../common/responses/paginated-api.response';
import { containsInsensitive, pageArgs, termSearchWhere, toPage } from '../../../../common/utils/pagination.util';
import { PrismaService } from '../../../../core/database/prisma.service';
import { toCsv } from '../../csv';
import { requireCrmMembership } from '../../crm-membership';
import { generateUnsubscribeToken, normalizeEmail } from '../../crm.constants';
import { resolveDefaultOrganizationId } from '../../default-organization';
import { formatFieldValueErrors, parseFieldValues } from '../../field-definitions/parse-field-values';
import { CrmEventsService } from '../../integration/crm-events.service';
import { CreateSubscriberDTO } from './dto/create-subscriber.dto';
import { GetAllSubscribersQueryDTO } from './dto/get-all-subscribers-query.dto';
import { SubscriberValuesDTO } from './dto/subscriber-values.dto';
import { startOfCurrentMonthManila } from './manila-month';
import {
  asValueMap,
  hideUnsubscribeToken,
  type SubscriberResponse,
  splitSubscriberValues,
  subscriberCurrentValues,
  subscriberFieldValue,
} from './subscriber-record';

@Injectable()
export class SubscribersService {
  constructor(
    private prisma: PrismaService,
    private readonly events: CrmEventsService,
  ) {}

  async createSubscriber(data: CreateSubscriberDTO): Promise<SubscriberResponse> {
    const organizationId = await resolveDefaultOrganizationId(this.prisma);
    const created = await this.prisma.newsletterSubscriber.create({
      data: {
        ...data,
        email: normalizeEmail(data.email),
        organizationId,
        unsubscribeToken: generateUnsubscribeToken(),
        consentAt: new Date(),
        values: {},
      },
    });
    await this.events.enqueue(organizationId, 'subscriber.created', { id: created.id, organizationId });
    return hideUnsubscribeToken(created);
  }

  async getStats(
    organizationId: string,
    userId: string,
  ): Promise<{ newThisMonth: number; unsubscribed: number }> {
    await requireCrmMembership(this.prisma, organizationId, userId);
    const monthStart = startOfCurrentMonthManila();
    const [newThisMonth, unsubscribed] = await Promise.all([
      this.prisma.newsletterSubscriber.count({
        where: { organizationId, createdAt: { gte: monthStart } },
      }),
      this.prisma.newsletterSubscriber.count({
        where: { organizationId, status: SubscriberStatus.UNSUBSCRIBED, isArchived: false },
      }),
    ]);
    return { newThisMonth, unsubscribed };
  }

  async getAllSubscribers(
    query: GetAllSubscribersQueryDTO,
    organizationId: string,
    userId: string,
  ): Promise<PaginatedResponse<SubscriberResponse>> {
    await requireCrmMembership(this.prisma, organizationId, userId);
    const where = this.listWhere(query, organizationId);
    const sortField = query.sortField ?? 'createdAt';
    const sortOrder = query.sortOrder ?? (sortField === 'createdAt' ? 'desc' : 'asc');

    const [subscribers, total] = await Promise.all([
      this.prisma.newsletterSubscriber.findMany({
        where,
        ...pageArgs(query),
        orderBy: [{ [sortField]: sortField === 'name' ? { sort: sortOrder, nulls: 'last' } : sortOrder }, { id: 'asc' }],
      }),
      this.prisma.newsletterSubscriber.count({ where }),
    ]);

    return toPage(subscribers.map(hideUnsubscribeToken), total, query);
  }

  async getSubscriber(id: string, organizationId: string, userId: string): Promise<SubscriberResponse> {
    await requireCrmMembership(this.prisma, organizationId, userId);
    return hideUnsubscribeToken(await this.find(id, organizationId));
  }

  async updateSubscriberValues(
    id: string,
    body: SubscriberValuesDTO,
    organizationId: string,
    userId: string,
  ): Promise<SubscriberResponse> {
    await requireCrmMembership(this.prisma, organizationId, userId);
    const subscriber = await this.find(id, organizationId);
    const parsed = await this.parseValues(organizationId, body.values, {
      mode: 'update',
      current: subscriberCurrentValues(subscriber),
    });
    const { columns, custom } = splitSubscriberValues(parsed, asValueMap(subscriber.values));
    const updated = await this.prisma.newsletterSubscriber.update({
      where: { id },
      data: {
        ...columns,
        ...(typeof columns.email === 'string' ? { email: normalizeEmail(columns.email) } : {}),
        values: custom as Prisma.InputJsonValue,
      },
    });
    return hideUnsubscribeToken(updated);
  }

  async archiveSubscriber(id: string, organizationId: string, userId: string): Promise<SubscriberResponse> {
    return this.setArchived(id, true, organizationId, userId);
  }

  async restoreSubscriber(id: string, organizationId: string, userId: string): Promise<SubscriberResponse> {
    return this.setArchived(id, false, organizationId, userId);
  }

  async exportSubscribers(
    query: GetAllSubscribersQueryDTO,
    organizationId: string,
    userId: string,
  ): Promise<{ file: StreamableFile; filename: string }> {
    await requireCrmMembership(this.prisma, organizationId, userId);
    const where = this.listWhere(query, organizationId);
    const [fields, subscribers] = await Promise.all([
      this.prisma.fieldDefinition.findMany({
        where: { organizationId, collection: FieldCollection.subscriber },
        orderBy: [{ position: 'asc' }, { id: 'asc' }],
      }),
      this.prisma.newsletterSubscriber.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      }),
    ]);
    const fallback = [
      { key: 'name', label: 'Name' },
      { key: 'email', label: 'Email' },
    ];
    const columns = fields.length ? fields : fallback;
    const rows = subscribers.map((subscriber) => columns.map((field) => subscriberFieldValue(subscriber, field.key)));
    return { file: new StreamableFile(toCsv(columns.map((field) => field.label), rows)), filename: 'subscribers.csv' };
  }

  async unsubscribeByToken(token: string): Promise<void> {
    if (!token) return;
    const subscriber = await this.prisma.newsletterSubscriber.findUnique({
      where: { unsubscribeToken: token },
    });
    if (!subscriber || subscriber.status === SubscriberStatus.UNSUBSCRIBED) return;
    const updated = await this.prisma.newsletterSubscriber.updateMany({
      where: { id: subscriber.id, status: SubscriberStatus.SUBSCRIBED },
      data: { status: SubscriberStatus.UNSUBSCRIBED, unsubscribedAt: new Date() },
    });
    if (updated.count > 0) {
      await this.events.enqueue(subscriber.organizationId, 'subscriber.unsubscribed', {
        id: subscriber.id,
        organizationId: subscriber.organizationId,
      });
    }
  }

  private async setArchived(
    id: string,
    isArchived: boolean,
    organizationId: string,
    userId: string,
  ): Promise<SubscriberResponse> {
    await requireCrmMembership(this.prisma, organizationId, userId);
    await this.find(id, organizationId);
    await this.prisma.newsletterSubscriber.updateMany({ where: { id, organizationId }, data: { isArchived } });
    return hideUnsubscribeToken(await this.find(id, organizationId));
  }

  private async find(id: string, organizationId: string): Promise<NewsletterSubscriber> {
    const subscriber = await this.prisma.newsletterSubscriber.findFirst({ where: { id, organizationId } });
    if (!subscriber) throw new NotFoundException('Subscriber not found in this organization.');
    return subscriber;
  }

  private listWhere(query: GetAllSubscribersQueryDTO, organizationId: string): Prisma.NewsletterSubscriberWhereInput {
    return {
      organizationId,
      isArchived: query.isArchived ?? false,
      ...(query.status ? { status: query.status } : {}),
      ...termSearchWhere<Prisma.NewsletterSubscriberWhereInput>(
        query.search,
        (term) => [{ email: containsInsensitive(term) }, { name: containsInsensitive(term) }],
      ),
    };
  }

  private async parseValues(
    organizationId: string,
    values: unknown,
    options: { mode: 'create' | 'update'; current?: Record<string, unknown> },
  ): Promise<Record<string, unknown>> {
    const definitions = await this.prisma.fieldDefinition.findMany({
      where: { organizationId, collection: FieldCollection.subscriber },
    });
    const result = parseFieldValues(definitions, values, options);
    if (!result.ok) throw new BadRequestException(formatFieldValueErrors(result.errors));
    return result.normalized;
  }
}
