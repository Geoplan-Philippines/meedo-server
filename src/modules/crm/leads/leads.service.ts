import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../core/database/prisma.service';
import { Lead } from '@prisma/client';
import { CreateLeadDTO } from './dto/create-lead.dto';

type PaginatedLeads = {
  data: Lead[];
  meta: {
    total: number;
    limit: number;
    page: number;
    totalPages: number;
  };
};

@Injectable()
export class LeadsService {
  constructor(private prisma: PrismaService) {}

  async createLead(data: CreateLeadDTO): Promise<Lead> {
    return this.prisma.lead.create({
      data,
    });
  }

  async getAllLeads(page: number, limit: number): Promise<PaginatedLeads> {
    const [leads, total] = await this.prisma.$transaction([
      this.prisma.lead.findMany({
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.lead.count(),
    ]);
    return {
      data: leads,
      meta: {
        total,
        limit,
        page,
        totalPages: Math.ceil(total / limit),
      },
    };
  }
}
