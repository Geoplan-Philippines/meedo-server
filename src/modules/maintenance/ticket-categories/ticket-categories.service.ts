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
}
