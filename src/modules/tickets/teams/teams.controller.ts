import { Body, Controller, Get, Post, Query } from '@nestjs/common';

import { Team } from '@prisma/client';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';

import { TeamsService } from './teams.service';
import { CreateTeamDTO } from './dto/create-team.dto';
import { PaginatedResponse } from 'src/common/responses/paginated-api.response';
import { GetAllTeamsQueryDTO } from './dto/get-all-teams-query.dto';

@Controller('tickets/teams')
export class TeamsController {
  constructor(private readonly teamsService: TeamsService) {}

  @AllowAnonymous()
  @Post()
  async createTeam(
    @Query('organizationId') organizationId: string,
    @Body() body: CreateTeamDTO
  ): Promise<Team> {
    return this.teamsService.createTeam( organizationId, body );
  }

  @AllowAnonymous()
  @Get()
  async getAllTeams(@Query() query: GetAllTeamsQueryDTO
  ): Promise<PaginatedResponse<Team>>  { 
    return this.teamsService.getAllTeams(query.organizationId, query);
  }
}
