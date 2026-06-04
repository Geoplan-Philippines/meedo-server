import { Injectable } from '@nestjs/common';
import { TicketStatus } from '@prisma/client';

import { PrismaService } from '../../../core/database/prisma.service';
import { CreateStatusDTO } from './dto/create-status.dto';
import { UpdateStatusDTO } from './dto/update-status.dto';


@Injectable()
export class StatusesService {
  constructor(private prisma: PrismaService) {}

  async getStatusesByOrganization(organizationId: string): Promise<TicketStatus[]> {
    return this.prisma.ticketStatus.findMany({
      where: {
        organizationId,
      },
    });
  }

  async createStatus(data: CreateStatusDTO, organizationId: string): Promise<TicketStatus> {
    return this.prisma.ticketStatus.create({
      data: {
        name: data.name,
        color: data.color,
        organization: {
          connect: { id: organizationId },
        },
      },
    });
  }

  async updateStatus(id: string, data: UpdateStatusDTO, organizationId: string): Promise<TicketStatus> {
    return this.prisma.ticketStatus.update({
      where: { id, organizationId },
      data,
    });
  }

  async archiveStatus(id: string, organizationId: string): Promise<TicketStatus> {
    return this.prisma.ticketStatus.update({
      where: { id, organizationId },
      data: { isArchived: true },
    });
  }

  async restoreStatus(id: string, organizationId: string): Promise<TicketStatus> {
    return this.prisma.ticketStatus.update({
      where: { id, organizationId },
      data: { isArchived: false },
    });
  }
}
