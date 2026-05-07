import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/core/database/prisma.service';
import { NewsletterSubscriber } from '@prisma/client';
import { CreateSubscriberDTO } from './dto/create-subscriber.dto';

@Injectable()
export class SubscribersService {
  constructor(private prisma: PrismaService) {}

  async create(data: CreateSubscriberDTO): Promise<NewsletterSubscriber> {
    return this.prisma.newsletterSubscriber.create({
      data,
    });
  }

  async findAll(): Promise<NewsletterSubscriber[]> {
    return this.prisma.newsletterSubscriber.findMany();
  }
}

////