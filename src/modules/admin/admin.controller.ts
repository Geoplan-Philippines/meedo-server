import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';

import { OrgRoles, Session } from '@thallesp/nestjs-better-auth';
import type { UserSession } from '@thallesp/nestjs-better-auth';

import { AdminService } from './admin.service';
import { OnboardMemberDTO } from './dto/onboard-member.dto';
import { UpdateMemberDTO } from './dto/update-member.dto';

@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Post('onboard-member')
  @OrgRoles(['owner', 'admin'])
  onboardMember(
    @Body() body: OnboardMemberDTO,
    @Session() session: UserSession,
  ) {
    return this.adminService.onboardMember(
      body,
      this.getActiveOrganizationId(session),
    );
  }

  @Get('members/:memberId')
  @OrgRoles(['owner', 'admin'])
  getMember(
    @Param('memberId') memberId: string,
    @Session() session: UserSession,
  ) {
    return this.adminService.getMember(
      memberId,
      this.getActiveOrganizationId(session),
    );
  }

  @Patch('members/:memberId')
  @OrgRoles(['owner', 'admin'])
  updateMember(
    @Param('memberId') memberId: string,
    @Body() body: UpdateMemberDTO,
    @Session() session: UserSession,
  ) {
    return this.adminService.updateMember(
      memberId,
      body,
      this.getActiveOrganizationId(session),
    );
  }

  private getActiveOrganizationId(session: UserSession): string {
    const { activeOrganizationId } = session.session;
    if (!activeOrganizationId) {
      throw new ForbiddenException('No active organization selected');
    }
    return activeOrganizationId;
  }
}
