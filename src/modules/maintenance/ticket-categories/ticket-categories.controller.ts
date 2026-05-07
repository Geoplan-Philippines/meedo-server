import { Body, Controller, Get, Post, Patch, Delete, Param, } from '@nestjs/common';

import { TicketCategory } from '@prisma/client';
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
  ): Promise<TicketCategory> {
    return this.ticketCategoriesService.createTicketCategory(createTicketCategoryDTO);
  }

  @AllowAnonymous()
  @Get()
  async findAll(): Promise<TicketCategory[]> {
    return this.ticketCategoriesService.getAllTicketCategories();
  }

  @AllowAnonymous()
  @Get(':id')
  async findOne(@Param('id') id: string): Promise<TicketCategories | null> {
    return this.ticketCategoriesService.getTicketCategoryById(id);
  }

  @AllowAnonymous()
  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() body: Partial<CreateTicketCategoryDTO>
  ): Promise<TicketCategories> {
    return this.ticketCategoriesService.updateTicketCategory(id, body);
  }

  @AllowAnonymous()
  @Delete(':id')
  async remove(@Param('id') id: string): Promise<TicketCategories> {
    return this.ticketCategoriesService.deleteTicketCategory(id);
  }
}


