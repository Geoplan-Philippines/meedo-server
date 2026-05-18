import { Controller, Get, Post, Body, Query } from '@nestjs/common';

import { Lead } from '@prisma/client';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';

import { CreateLeadDTO } from './dto/create-lead.dto';
import { LeadsService } from './leads.service';

@Controller('crm/leads')
export class LeadsController {
  constructor(private readonly leadsService: LeadsService) {}

  @AllowAnonymous()
  @Post()
  async createLead(@Body() body: CreateLeadDTO): Promise<Lead> {
    return this.leadsService.createLead(body);
  }

  @AllowAnonymous()
  @Get()
  async getAllLeads(
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '10',
  ): Promise<any> {
    
    const pageNumber = Math.max(1, Number(page));
    const limitNumber = Math.min(50, Number(limit));
    return this.leadsService.getAllLeads(pageNumber, limitNumber);
  }
}