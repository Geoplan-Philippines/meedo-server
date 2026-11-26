import { Controller, Get, Header, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';

import { SubscribersService } from '../newsletter/subscribers/subscribers.service';

export const UNSUBSCRIBE_CONFIRMATION_HTML =
  '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Unsubscribe</title></head><body><p>You have been unsubscribed from this mailing list.</p></body></html>';

@ApiTags('Public')
@Controller('public/unsubscribe')
export class PublicUnsubscribeController {
  constructor(private readonly subscribers: SubscribersService) {}

  @AllowAnonymous()
  @Get(':token')
  @Header('Content-Type', 'text/html; charset=utf-8')
  @ApiOperation({ summary: 'One-click unsubscribe. Always shows the same confirmation.' })
  async unsubscribeGet(@Param('token') token: string): Promise<string> {
    await this.subscribers.unsubscribeByToken(token);
    return UNSUBSCRIBE_CONFIRMATION_HTML;
  }

  @AllowAnonymous()
  @Post(':token')
  @Header('Content-Type', 'text/html; charset=utf-8')
  @ApiOperation({ summary: 'One-click unsubscribe. Always shows the same confirmation.' })
  async unsubscribePost(@Param('token') token: string): Promise<string> {
    await this.subscribers.unsubscribeByToken(token);
    return UNSUBSCRIBE_CONFIRMATION_HTML;
  }
}
