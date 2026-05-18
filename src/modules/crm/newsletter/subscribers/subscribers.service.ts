import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../core/database/prisma.service';
import { NewsletterSubscriber } from '@prisma/client';
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
    const { page, limit } = query;
    
    const [subscribers, total] = await Promise.all([
      this.prisma.newsletterSubscriber.findMany({
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.newsletterSubscriber.count(),
    ]);

    return {
      data: subscribers,
      meta: {
        total,
        limit,
        page,
        lastPage: Math.ceil(total / limit),
      },
    }
  }
}
