import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';

import { CurrentOrganizationId } from '../../../common/decorators/current-organization-id.decorator';
import { AddTeamMemberDTO } from './dto/add-team-member.dto';
import { TeamsService } from './teams.service';

@Controller('settings/teams')
export class TeamsController {
  constructor(private readonly teamsService: TeamsService) {}

  @AllowAnonymous()
  @Get(':teamId/members')
  async listTeamMembers(
    @Param('teamId') teamId: string,
    @CurrentOrganizationId() organizationId: string,
  ) {
    return this.teamsService.listTeamMembers(teamId, organizationId);
  }

  @AllowAnonymous()
  @Post(':teamId/members')
  async addTeamMember(
    @Param('teamId') teamId: string,
    @Body() body: AddTeamMemberDTO,
    @CurrentOrganizationId() organizationId: string,
  ) {
    return this.teamsService.addTeamMember(teamId, body.userId, organizationId);
  }

  @AllowAnonymous()
  @Delete(':teamId/members/:userId')
  async removeTeamMember(
    @Param('teamId') teamId: string,
    @Param('userId') userId: string,
    @CurrentOrganizationId() organizationId: string,
  ) {
    return this.teamsService.removeTeamMember(teamId, userId, organizationId);
  }
}
