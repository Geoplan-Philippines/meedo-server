import { Controller, Get, Post, Body } from '@nestjs/common';

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
  async getAllLeads(): Promise<Lead[]> {
    return this.leadsService.getAllLeads();
  }
}
