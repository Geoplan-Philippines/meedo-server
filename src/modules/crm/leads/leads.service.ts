import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../core/database/prisma.service';
import { Lead } from '@prisma/client';
import { CreateLeadDTO } from './dto/create-lead.dto';
import { GetAllLeadsQueryDTO } from './dto/get-all-leads-query.dto';
import { PaginatedResponse } from 'src/common/responses/paginated-api.response';

@Injectable()
export class LeadsService {
  constructor(private prisma: PrismaService) {}

  async createLead(data: CreateLeadDTO): Promise<Lead> {
    return this.prisma.lead.create({
      data,
    });
  }

  async getAllLeads(query: GetAllLeadsQueryDTO): Promise<PaginatedResponse<Lead>> {
    const { page, limit } = query;
    
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
        lastPage: Math.ceil(total / limit),
      },
    };
  }
}
