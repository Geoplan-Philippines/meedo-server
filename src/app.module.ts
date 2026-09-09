import { Module, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard } from '@nestjs/throttler';

import { AuthModule } from '@thallesp/nestjs-better-auth';

import { HealthModule } from './core/health/health.module';
import { auth } from "./core/auth/auth";
import { PrismaModule } from './core/database/prisma.module';
import { RateLimitModule } from './core/security/rate-limit.module';
import { ResponseInteceptor } from './common/interceptors/response.interceptors';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';

import { AppController } from './app.controller';
import { AppService } from './app.service';
import { MaintenanceModule } from './modules/maintenance/maintenance.module';
import { TimekeepingModule } from './modules/timekeeping/timekeeping.module';
import { CrmModule } from './modules/crm/crm.module';
import { AdminModule } from './modules/admin/admin.module';
import { StatusesModule } from './modules/settings/statuses/statuses.module';
import { TeamsModule } from './modules/settings/teams/teams.module';
import { AttendanceSettingsModule } from './modules/settings/attendance/attendance-settings.module';
import { ProjectsModule } from './modules/projects/projects.module';
import { TicketsModule } from './modules/tickets/tickets.module';
import { SlaPoliciesModule } from './modules/sla/sla-policies.module';
import { AttendanceModule } from './modules/attendance/attendance.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    ScheduleModule.forRoot(),
    AuthModule.forRoot({ auth }),
    PrismaModule,
    HealthModule,
    RateLimitModule,
    MaintenanceModule,
    TimekeepingModule,
    CrmModule,
    AdminModule,
    StatusesModule,
    TeamsModule,
    AttendanceSettingsModule,
    ProjectsModule,
    TicketsModule,
    SlaPoliciesModule,
    AttendanceModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_PIPE,
      useValue: new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    },
    {
      provide: APP_FILTER,
      useClass: AllExceptionsFilter,
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
