import { Injectable } from '@nestjs/common';
import { NewsletterSubscriber, Prisma } from '@prisma/client';

import { PaginatedResponse } from '../../../../common/responses/paginated-api.response';
import { containsInsensitive, pageArgs, termSearchWhere, toPage } from '../../../../common/utils/pagination.util';
import { PrismaService } from '../../../../core/database/prisma.service';
import { requireCrmMembership } from '../../crm-membership';
import { normalizeEmail } from '../../crm.constants';
import { resolveDefaultOrganizationId } from '../../default-organization';
import { CreateSubscriberDTO } from './dto/create-subscriber.dto';
import { GetAllSubscribersQueryDTO } from './dto/get-all-subscribers-query.dto';

@Injectable()
export class SubscribersService {
  constructor(private prisma: PrismaService) {}

  async createSubscriber(
    data: CreateSubscriberDTO,
  ): Promise<NewsletterSubscriber> {
    const organizationId = await resolveDefaultOrganizationId(this.prisma);
    return this.prisma.newsletterSubscriber.create({
      data: {
        ...data,
        email: normalizeEmail(data.email),
        organizationId,
      },
    });
  }

  async getAllSubscribers(
    query: GetAllSubscribersQueryDTO,
    organizationId: string,
    userId: string,
  ): Promise<PaginatedResponse<NewsletterSubscriber>> {
    await requireCrmMembership(this.prisma, organizationId, userId);
    const where: Prisma.NewsletterSubscriberWhereInput = {
      organizationId,
      ...termSearchWhere<Prisma.NewsletterSubscriberWhereInput>(
        query.search,
        (term) => [{ email: containsInsensitive(term) }, { name: containsInsensitive(term) }],
      ),
    };
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

    return toPage(subscribers, total, query);
  }
}
