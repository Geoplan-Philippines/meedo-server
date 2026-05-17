import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../core/database/prisma.service';
import { Lead } from '@prisma/client';
import { CreateLeadDTO } from './dto/create-lead.dto';

@Injectable()
export class LeadsService {
  constructor(private prisma: PrismaService) {}

  async createLead(data: CreateLeadDTO): Promise<Lead> {
    return this.prisma.lead.create({
      data,
    });
  }

  async getAllLeads(): Promise<Lead[]> {
    return this.prisma.lead.findMany();
  }
}
