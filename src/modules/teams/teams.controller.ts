import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { Team } from '@prisma/client';

import { CurrentOrganizationId } from 'src/common/decorators/current-organization-id.decorator';

import { TeamsService } from './teams.service';
import { CreateTeamDTO } from './dto/create-team.dto';
import { UpdateTeamDTO } from './dto/update-team.dto';

@Controller('teams')
export class TeamsController {
  constructor(private readonly teamsService: TeamsService) {}

  @Post()
  async createTeam(
    @CurrentOrganizationId() organizationId: string,
    @Body() body: CreateTeamDTO,
  ): Promise<Team> {
    return this.teamsService.createTeam(organizationId, body);
  }

  @Get()
  async getAllTeams(
    @CurrentOrganizationId() organizationId: string,
  ): Promise<Team[]> {
    return this.teamsService.getAllTeams(organizationId);
  }

  @Patch(':id')
  async updateTeam(
    @CurrentOrganizationId() organizationId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateTeamDTO,
  ): Promise<Team> {
    return this.teamsService.updateTeam(organizationId, id, body);
  }

  @Delete(':id')
  async archiveTeam(
    @CurrentOrganizationId() organizationId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<Team> {
    return this.teamsService.archiveTeam(organizationId, id);
  }
}
