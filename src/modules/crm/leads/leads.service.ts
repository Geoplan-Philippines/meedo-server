import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../core/database/prisma.service';
import { Lead, LeadStatus } from '@prisma/client';
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

  async getStats(): Promise<{ total: number; pending: number; contacted: number; qualified: number; lost: number }> {
    const groups = await this.prisma.lead.groupBy({ by: ['status'], _count: { _all: true } });
    const counts = new Map(groups.map((group) => [group.status, group._count._all]));
    const pending = counts.get(LeadStatus.PENDING) ?? 0;
    const contacted = counts.get(LeadStatus.CONTACTED) ?? 0;
    const qualified = counts.get(LeadStatus.QUALIFIED) ?? 0;
    const lost = counts.get(LeadStatus.LOST) ?? 0;
    return { total: pending + contacted + qualified + lost, pending, contacted, qualified, lost };
  }

  async getAllLeads(query: GetAllLeadsQueryDTO): Promise<PaginatedResponse<Lead>> {
    const { page, limit } = query;
    
    const [leads, total] = await Promise.all([
      this.prisma.lead.findMany({
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
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
