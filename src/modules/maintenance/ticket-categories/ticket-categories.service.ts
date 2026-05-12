import { Injectable } from '@nestjs/common';
import { TicketCategory } from '@prisma/client';

import { PrismaService } from '../../../core/database/prisma.service';
import { CreateTicketCategoryDTO } from './dto/create-ticket-category.dto';

@Injectable()
export class TicketCategoriesService {
  constructor(private prisma: PrismaService) {}

  async createTicketCategory(
    createTicketCategoryDTO: CreateTicketCategoryDTO
  ): Promise<TicketCategory> {
    return this.prisma.ticketCategory.create({
      data: {
        name: createTicketCategoryDTO.name,
        description: createTicketCategoryDTO.description,
        organization: {
          connect: {
            id: createTicketCategoryDTO.organizationId,
          },
        },
      },
    });
  }

  async getAllTicketCategories(): Promise<TicketCategory[]> {
    return this.prisma.ticketCategory.findMany();
  }

  async getTicketCategoryById(id: string): Promise<TicketCategory | null> {
    return this.prisma.ticketCategory.findUnique({
      where: { id },
    });
  }

  async updateTicketCategory(
    id: string,
    data: Partial<CreateTicketCategoryDTO>
  ): Promise<TicketCategory> {
    return this.prisma.ticketCategory.update({
      where: { id },
      data,
    });
  }

  async deleteTicketCategory(id: string): Promise<TicketCategory> {
    return this.prisma.ticketCategory.delete({
      where: { id },
    });
  }

}
