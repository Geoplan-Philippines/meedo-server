import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';

import { AuthModule } from '@thallesp/nestjs-better-auth';

import { HealthModule } from './core/health/health.module';
import { auth } from "./core/auth/auth";

import { AppController } from './app.controller';
import { ResponseInteceptor } from './common/interceptors/response.interceptors';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { AppService } from './app.service';
import { ThrottlerGuard } from '@nestjs/throttler';
import { RateLimitModule } from './core/security/rate-limit.module';
import { MaintenanceModule } from './modules/maintenance/maintenance.module';
import { TimekeepingModule } from './modules/timekeeping/timekeeping.module';
import { CrmModule } from './modules/crm/crm.module';
import { PrismaModule } from './core/database/prisma.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    AuthModule.forRoot({ auth }),
    PrismaModule,
    HealthModule,
    RateLimitModule,
    MaintenanceModule,
    TimekeepingModule,
    CrmModule
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
