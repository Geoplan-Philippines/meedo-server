import { Body, Controller, Post, Req } from '@nestjs/common';
import type { Request } from 'express';

import { fromNodeHeaders } from 'better-auth/node';

import { AdminService } from './admin.service';
import { OnboardMemberDTO } from './dto/onboard-member.dto';

@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Post('onboard-member')
  async onboardMember(@Body() body: OnboardMemberDTO, @Req() req: Request) {
    return this.adminService.onboardMember(body, fromNodeHeaders(req.headers));
  }
}
