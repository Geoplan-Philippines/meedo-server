import { Controller, Get, Post, Body } from '@nestjs/common';

import { NewsletterSubscriber } from '@prisma/client';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';

import { CreateSubscriberDTO } from './dto/create-subscriber.dto';
import { SubscribersService } from './subscribers.service';

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
  async getAllSubscribers(): Promise<NewsletterSubscriber[]> {
    return this.subscribersService.getAllSubscribers();
  }
}