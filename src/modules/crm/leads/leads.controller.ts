import { Controller, Get, Post, Body } from '@nestjs/common';

import { Lead } from '@prisma/client';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';

import { CreateLeadDTO } from './dto/create-lead.dto';
import { LeadsService } from './leads.service';

@Controller('crm/leads')
export class LeadsController {
  constructor(private readonly leadsService: LeadsService) {}

  // TODO: Research best practice to not keep this @AllowAnonymous()... but is also can access by our Geoplan Website..
  @AllowAnonymous()
  @Post()
  async createLead(@Body() body: CreateLeadDTO): Promise<Lead> {
    return this.leadsService.createLead(body);
  }

  // TODO: findMany() With No Pagination Anywhere
  @AllowAnonymous()
  @Get()
  async getAllLeads(): Promise<Lead[]> {
    return this.leadsService.getAllLeads();
  }
}
