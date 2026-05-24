import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, Team } from '@prisma/client';

import { PrismaService } from 'src/core/database/prisma.service';

import { CreateTeamDTO } from './dto/create-team.dto';
import { UpdateTeamDTO } from './dto/update-team.dto';

@Injectable()
export class TeamsService {
  constructor(private prisma: PrismaService) {}

  async createTeam(organizationId: string, body: CreateTeamDTO): Promise<Team> {
    try {
      return await this.prisma.team.create({
        data: { ...body, organizationId },
      });
    } catch (error) {
      if ( error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException(
          `Team with name "${body.name}" already exists in this organization`,
        );
      }
      throw error;
    }
  }

  async getAllTeams(organizationId: string): Promise<Team[]> {
    return this.prisma.team.findMany({
      where: { organizationId, isArchived: false },
      orderBy: { createdAt: 'desc' },
    });
  }

  async updateTeam(organizationId: string, id: string, body: UpdateTeamDTO): Promise<Team> {
    await this.assertTeamExists(organizationId, id);

    try {
      return await this.prisma.team.update({
        where: { id, organizationId },
        data: { ...body },
      });
    } catch (error) {
      if ( error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException(
          body.name
            ? `Team with name "${body.name}" already exists in this organization`
            : 'Team name conflicts with an existing team in this organization',
        );
      }
      throw error;
    }
  }

  async archiveTeam(organizationId: string, id: string): Promise<Team> {
    await this.assertTeamExists(organizationId, id);

    return this.prisma.team.update({
      where: { id, organizationId },
      data: { isArchived: true },
    });
  }

  private async assertTeamExists(organizationId: string, id: string): Promise<void> {
    const team = await this.prisma.team.findFirst({
      where: { id, organizationId },
      select: { id: true },
    });

    if (!team) {
      throw new NotFoundException(`Team not found`);
    }
  }
}
