import { Controller, Get } from '@nestjs/common';
import { HealthService } from './health.service';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';

@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @AllowAnonymous()
  @Get()
  async check() {
    return this.healthService.check();
  }
}
