import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../core/database/prisma.service';
import { Lead, LeadStatus, Prisma } from '@prisma/client';
import { CreateLeadDTO } from './dto/create-lead.dto';
import { GetAllLeadsQueryDTO } from './dto/get-all-leads-query.dto';
import { PaginatedResponse } from 'src/common/responses/paginated-api.response';
import { containsInsensitive, pageArgs, termSearchWhere, toPage } from 'src/common/utils/pagination.util';

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
    const where: Prisma.LeadWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...termSearchWhere<Prisma.LeadWhereInput>(query.search, (term) => [
        { firstName: containsInsensitive(term) },
        { lastName: containsInsensitive(term) },
        { email: containsInsensitive(term) },
        { company: containsInsensitive(term) },
      ]),
    };
    const sortField = query.sortField ?? 'createdAt';
    const sortOrder = query.sortOrder ?? (sortField === 'createdAt' ? 'desc' : 'asc');
    // Company and phone are optional; empty values go last in either direction.
    const sort = sortField === 'company' || sortField === 'phoneNumber' ? { sort: sortOrder, nulls: 'last' as const } : sortOrder;

    const [leads, total] = await Promise.all([
      this.prisma.lead.findMany({
        where,
        ...pageArgs(query),
        orderBy: [{ [sortField]: sort }, { id: 'asc' }],
      }),
      this.prisma.lead.count({ where }),
    ]);

    return toPage(leads, total, query);
  }
}
