import { Body, Controller, Get, Post, Query, UsePipes, ValidationPipe } from '@nestjs/common';

import { Team } from '@prisma/client';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';

import { TeamsService } from './teams.service';
import { CreateTeamDTO } from './dto/create-team.dto';
import { PaginatedResponse } from 'src/common/responses/paginated-api.response';
import { GetAllTeamsQueryDTO } from './dto/get-all-teams-query.dto';
import { CreateTeamQueryDTO } from './dto/create-team-query.dto';

@Controller('tickets/teams')
export class TeamsController {
  constructor(private readonly teamsService: TeamsService) {}

  @AllowAnonymous()
  @Post()
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))
  async createTeam(
    @Query() query: CreateTeamQueryDTO,
    @Body() body: CreateTeamDTO
  ): Promise<Team> {
    return this.teamsService.createTeam( query.organizationId, body );
  }

  @AllowAnonymous()
  @Get()
  async getAllTeams(@Query() query: GetAllTeamsQueryDTO
  ): Promise<PaginatedResponse<Team>>  { 
    return this.teamsService.getAllTeams(query.organizationId, query);
  }
}
