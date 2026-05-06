import { Module } from '@nestjs/common';
import { AuthModule } from '@thallesp/nestjs-better-auth';

import { auth } from "./core/auth/auth";

import { HealthModule } from './core/health/health.module';

import { AppController } from './app.controller';
import { AppService } from './app.service';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard } from '@nestjs/throttler';
import { RateLimitModule } from './core/security/rate-limit.module';

@Module({
  imports: [
    AuthModule.forRoot({ auth }),
    HealthModule,
    RateLimitModule
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
