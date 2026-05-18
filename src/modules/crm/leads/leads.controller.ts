import { Controller, Get, Post, Body, Query } from '@nestjs/common';

import { Lead } from '@prisma/client';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';

import { CreateLeadDTO } from './dto/create-lead.dto';
import { GetAllLeadsQueryDTO } from './dto/get-all-leads-query.dto';
import { LeadsService } from './leads.service';
import { PaginatedResponse } from 'src/common/responses/paginated-api.response';

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
  async getAllLeads(@Query() query: GetAllLeadsQueryDTO): Promise<PaginatedResponse<Lead>> {
    return this.leadsService.getAllLeads(query);
  }
}