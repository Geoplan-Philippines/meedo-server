import { Injectable } from '@nestjs/common';
import { TicketCategories } from '@prisma/client';

import { PrismaService } from 'src/core/database/prisma.service';
import { CreateTicketCategoryDTO } from './dto/create-ticket-category.dto';

@Injectable()
export class TicketCategoriesService {
  constructor(private prisma: PrismaService) {}

  async createTicketCategory(
    createTicketCategoryDTO: CreateTicketCategoryDTO
  ): Promise<TicketCategories> {
    return this.prisma.ticketCategories.create({
      data: createTicketCategoryDTO,
    });
  }

  async getAllTicketCategories(): Promise<TicketCategories[]> {
    return this.prisma.ticketCategories.findMany();
  }

  async getTicketCategoryById(id: string): Promise<TicketCategories | null> {
    return this.prisma.ticketCategories.findUnique({
      where: { id },
    });
  }

  async updateTicketCategory(
    id: string,
    data: Partial<CreateTicketCategoryDTO>
  ): Promise<TicketCategories> {
    return this.prisma.ticketCategories.update({
      where: { id },
      data,
    });
  }

  async deleteTicketCategory(id: string): Promise<TicketCategories> {
    return this.prisma.ticketCategories.delete({
      where: { id },
    });
  }

}
