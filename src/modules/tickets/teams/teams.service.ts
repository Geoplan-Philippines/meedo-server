import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/core/database/prisma.service';
import { Team } from '@prisma/client';

import { CreateTeamDTO } from './dto/create-team.dto';
import { GetAllTeamsQueryDTO } from './dto/get-all-teams-query.dto';
import { PaginatedResponse } from 'src/common/responses/paginated-api.response';

@Injectable()
export class TeamsService {
  constructor(private prisma: PrismaService) {}

  async createTeam(data: CreateTeamDTO): Promise<Team> {
    return this.prisma.team.create({
      data,
    });
  }

  async getAllTeams(
    query: GetAllTeamsQueryDTO,
  ): Promise<PaginatedResponse<Team>> {
    const {page, limit} = query;

    const [teams, total] = await Promise.all([
      this.prisma.team.findMany({
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.team.count(),
    ]);

    return {
      data: teams,
      meta: {
        total,
        limit,
        page,
        lastPage: Math.ceil(total / limit),
      },
    }
  }
}