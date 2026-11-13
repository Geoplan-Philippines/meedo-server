import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../core/database/prisma.service';
import { NewsletterSubscriber, Prisma } from '@prisma/client';
import { containsInsensitive, pageArgs, termSearchWhere, toPage } from 'src/common/utils/pagination.util';
import { CreateSubscriberDTO } from './dto/create-subscriber.dto';
import { GetAllSubscribersQueryDTO } from './dto/get-all-subscribers-query.dto';
import { PaginatedResponse } from 'src/common/responses/paginated-api.response';

@Injectable()
export class SubscribersService {
  constructor(private prisma: PrismaService) {}

  async createSubscriber(
    data: CreateSubscriberDTO
  ): Promise<NewsletterSubscriber> {
    return this.prisma.newsletterSubscriber.create({
      data,
    });
  }

  async getAllSubscribers(
    query: GetAllSubscribersQueryDTO
  ): Promise<PaginatedResponse<NewsletterSubscriber>> {
    const where: Prisma.NewsletterSubscriberWhereInput = termSearchWhere<Prisma.NewsletterSubscriberWhereInput>(
      query.search,
      (term) => [{ email: containsInsensitive(term) }, { name: containsInsensitive(term) }],
    );
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
