import { Module } from '@nestjs/common';
import { AuthModule } from '@thallesp/nestjs-better-auth';

import { auth } from "./core/auth/auth";

import { HealthModule } from './core/health/health.module';

import { AppController } from './app.controller';
import { AppService } from './app.service';

@Module({
  imports: [
    AuthModule.forRoot({ auth }),
    HealthModule
  ],
  controllers: [AppController],
  providers: [
    AppService
  ],
})
export class AppModule {}
