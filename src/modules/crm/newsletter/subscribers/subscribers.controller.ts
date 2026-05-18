import { Controller, Get, Post, Body, Query } from '@nestjs/common';

import { NewsletterSubscriber } from '@prisma/client';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';

import { CreateSubscriberDTO } from './dto/create-subscriber.dto';
import { SubscribersService } from './subscribers.service';

import { GetAllSubscribersQueryDTO } from './dto/get-all-subscribers-query.dto';
import { PaginatedResponse } from 'src/common/responses/paginated-api.response';

@Controller('crm/newsletter/subscribers')
export class SubscribersController {
  constructor(private readonly subscribersService: SubscribersService) {}

  @AllowAnonymous()
  @Post()
  async createSubscriber(
    @Body() body: CreateSubscriberDTO
  ): Promise<NewsletterSubscriber> {
    return this.subscribersService.createSubscriber(body);
  }

  @AllowAnonymous()
  @Get()
  async getAllSubscribers(
    @Query() query: GetAllSubscribersQueryDTO,
  ): Promise<PaginatedResponse<NewsletterSubscriber>> {
    return this.subscribersService.getAllSubscribers(query);
  }
}