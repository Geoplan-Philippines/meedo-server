import { Controller, Get } from '@nestjs/common';
import { SubscribersService } from './subscribers.service';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';

@Controller('newsletter/subscribers')
export class SubscribersController {
  constructor(private readonly subscribersService: SubscribersService) {}

  @AllowAnonymous()
  @Get()
  findAll() {
    return 'hello world';
  }
}
