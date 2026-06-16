import { Injectable, NotFoundException } from '@nestjs/common';
import { TicketCategory } from '@prisma/client';

import { PrismaService } from '../../../../core/database/prisma.service';
import { CreateTicketCategoryDTO } from '../dto/create-ticket-category.dto';
import { UpdateTicketCategoryDTO } from '../dto/update-ticket-category.dto';

@Injectable()
export class TicketCategoriesService {
  constructor(private prisma: PrismaService) {}

  async createTicketCategory(
    createTicketCategoryDTO: CreateTicketCategoryDTO,
    organizationId: string,
  ): Promise<TicketCategory> {
    return this.prisma.ticketCategory.create({
      data: {
        name: createTicketCategoryDTO.name,
        description: createTicketCategoryDTO.description,
        organization: {
          connect: {
            id: organizationId,
          },
        },
      },
    });
  }

  async getAllTicketCategories(organizationId: string): Promise<TicketCategory[]> {
    return this.prisma.ticketCategory.findMany({
      where: { organizationId },
      orderBy: { name: 'asc' },
    });
  }

  async updateTicketCategory(
    id: string,
    data: UpdateTicketCategoryDTO,
    organizationId: string,
  ): Promise<TicketCategory> {
    await this.ensureExists(id, organizationId);
    return this.prisma.ticketCategory.update({
      where: { id },
      data,
    });
  }

  async deleteTicketCategory(id: string, organizationId: string): Promise<TicketCategory> {
    await this.ensureExists(id, organizationId);
    return this.prisma.ticketCategory.delete({
      where: { id },
    });
  }

  private async ensureExists(id: string, organizationId: string): Promise<void> {
    const category = await this.prisma.ticketCategory.findFirst({
      where: { id, organizationId },
      select: { id: true },
    });
    if (!category) {
      throw new NotFoundException('Ticket category not found in this organization.');
    }
  }
}
