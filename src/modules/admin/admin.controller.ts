import { Body, Controller, ForbiddenException, Post } from '@nestjs/common';

import { OrgRoles, Session } from '@thallesp/nestjs-better-auth';
import type { UserSession } from '@thallesp/nestjs-better-auth';

import { AdminService } from './admin.service';
import { OnboardMemberDTO } from './dto/onboard-member.dto';

@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Post('onboard-member')
  @OrgRoles(['owner', 'admin'])
  async onboardMember(
    @Body() body: OnboardMemberDTO,
    @Session() session: UserSession,
  ) {
    const { activeOrganizationId } = session.session;
    if (!activeOrganizationId) {
      throw new ForbiddenException('No active organization selected');
    }

    return this.adminService.onboardMember(body, activeOrganizationId);
  }
}
