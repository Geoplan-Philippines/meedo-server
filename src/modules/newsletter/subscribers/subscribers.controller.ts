import { Controller, Get, Post, Body } from '@nestjs/common';
import { SubscribersService } from './subscribers.service';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';
import { CreateSubscriberDTO } from './dto/create-subscriber.dto';
import { NewsletterSubscriber } from '@prisma/client';

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