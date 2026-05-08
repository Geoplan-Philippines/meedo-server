import { Controller, Get, Post, Body } from '@nestjs/common';

import { NewsletterSubscriber } from '@prisma/client';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';

import { CreateSubscriberDTO } from './dto/create-subscriber.dto';
import { SubscribersService } from './subscribers.service';

@Controller('newsletter/subscribers')
export class SubscribersController {
  constructor(private readonly subscribersService: SubscribersService) {}

  @AllowAnonymous()
  @Post()
  async create(
    @Body() body: CreateSubscriberDTO
  ): Promise<NewsletterSubscriber> {
    return this.subscribersService.create(body);
  }

  @AllowAnonymous()
  @Get()
  async findAll(): Promise<NewsletterSubscriber[]> {
    return this.subscribersService.findAll();
  }
}