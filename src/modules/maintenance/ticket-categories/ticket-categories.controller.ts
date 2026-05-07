import { Body, Controller, Get, Post } from '@nestjs/common';

import { TicketCategories } from '@prisma/client';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';

import { TicketCategoriesService } from './ticket-categories.service';
import { CreateTicketCategoryDTO } from './dto/create-ticket-category.dto';

@Controller('maintenance/ticket-categories')
export class TicketCategoriesController {
  constructor(private readonly ticketCategoriesService: TicketCategoriesService) {}

  @AllowAnonymous()
  @Post()
  async create(
    @Body() createTicketCategoryDTO: CreateTicketCategoryDTO
  ): Promise<TicketCategories> {
    return this.ticketCategoriesService.createTicketCategory(createTicketCategoryDTO);
  }

  @AllowAnonymous()
  @Get()
  async findAll(): Promise<TicketCategories[]> {
    return this.ticketCategoriesService.getAllTicketCategories();
  }
}
