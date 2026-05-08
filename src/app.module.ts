import { Module } from '@nestjs/common';
import { AuthModule } from '@thallesp/nestjs-better-auth';

import { auth } from "./core/auth/auth";

import { HealthModule } from './core/health/health.module';

import { AppController } from './app.controller';
import { ResponseInteceptor } from './common/interceptors/response.interceptors';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { AppService } from './app.service';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerGuard } from '@nestjs/throttler';
import { RateLimitModule } from './core/security/rate-limit.module';
import { MaintenanceModule } from './modules/maintenance/maintenance.module';
import { NewsletterModule } from './modules/newsletter/newsletter.module';

@Module({
  imports: [
    AuthModule.forRoot({ auth }),
    HealthModule,
    RateLimitModule,
    MaintenanceModule,
    NewsletterModule
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_FILTER,
      useClass: HttpExceptionFilter,
    },
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: ResponseInteceptor,
    },
  ],
})
export class AppModule {}
