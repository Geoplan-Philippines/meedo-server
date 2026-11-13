import { Body, Controller, Delete, Get, Param, Post, Query } from '@nestjs/common';
import { ApiOperation } from '@nestjs/swagger';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';

import { CurrentOrganizationId } from '../../../common/decorators/current-organization-id.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { ApiPaginatedResponse } from '../../../common/decorators/api-paginated-response.decorator';
import { PaginatedResponse } from '../../../common/responses/paginated-api.response';
import { AddTeamMemberDTO } from './dto/add-team-member.dto';
import { GetTeamsQueryDTO } from './dto/get-teams-query.dto';
import { TeamListRowDTO } from './dto/team-response.dto';
import { TeamsService, type TeamListRow } from './teams.service';

@Controller('settings/teams')
export class TeamsController {
  constructor(private readonly teamsService: TeamsService) {}

  @Get()
  @ApiOperation({ summary: 'List teams', description: 'Paginated teams with member counts. Search matches the name; mine=true keeps the caller\'s teams.' })
  @ApiPaginatedResponse(TeamListRowDTO)
  async listTeams(
    @Query() query: GetTeamsQueryDTO,
    @CurrentOrganizationId() organizationId: string,
    @CurrentUser('id') userId: string,
  ): Promise<PaginatedResponse<TeamListRow>> {
    return this.teamsService.listTeams(query, organizationId, userId);
  }

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
