import { Controller, Get, Header } from '@nestjs/common';
import { ApiOperation, ApiProduces, ApiTags } from '@nestjs/swagger';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';

import { env } from '../../../core/config/env.config';
import { buildIntegrationGuide } from './integration-guide';

@ApiTags('Docs')
@Controller('docs')
export class IntegrationDocsController {
  @AllowAnonymous()
  @Get('integration.md')
  @Header('Content-Type', 'text/plain; charset=utf-8')
  @Header('Cache-Control', 'public, max-age=60')
  @ApiProduces('text/plain')
  @ApiOperation({ summary: 'Public website integration guide' })
  async getIntegrationGuide(): Promise<string> {
    return buildIntegrationGuide(env.APP_URL);
  }
}
