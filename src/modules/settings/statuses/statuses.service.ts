import { Injectable } from '@nestjs/common';
import { Status } from '@prisma/client';

import { PrismaService } from '../../../core/database/prisma.service';
import { CreateStatusDTO } from './dto/create-status.dto';
import { UpdateStatusDTO } from './dto/update-status.dto';

const DEFAULT_STATUSES = [
  { name: 'Open', color: '#FF0000' },
  { name: 'In Progress', color: '#FFA500' },
  { name: 'Done', color: '#008000' },
  { name: 'Cancelled', color: '#808080' },
] as const;

@Injectable()
export class StatusesService {
  constructor(private prisma: PrismaService) {}

  async getStatusesByOrganization(organizationId: string): Promise<Status[]> {
    return this.prisma.status.findMany({
      where: {
        organizationId,
      },
    });
  }

  async createStatus(data: CreateStatusDTO, organizationId: string): Promise<Status> {
    return this.prisma.status.create({
      data: {
        name: data.name,
        color: data.color,
        organization: {
          connect: { id: organizationId },
        },
      },
    });
  }

  async updateStatus(id: string, data: UpdateStatusDTO, organizationId: string): Promise<Status> {
    return this.prisma.status.update({
      where: { id, organizationId },
      data,
    });
  }

  async deleteStatus(id: string, organizationId: string): Promise<Status> {
    return this.prisma.status.delete({
      where: { id, organizationId },
    });
  }

  async autoCreateDefaultStatuses(organizationId: string): Promise<void> {
    await this.prisma.status.createMany({
      data: DEFAULT_STATUSES.map((status) => ({
        name: status.name,
        color: status.color,
        organizationId,
      })),
      skipDuplicates: true,
    });
  }
}
