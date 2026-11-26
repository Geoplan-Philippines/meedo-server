import { Injectable } from '@nestjs/common';
import { Lead, LeadStatus, Prisma } from '@prisma/client';

import { PaginatedResponse } from '../../../common/responses/paginated-api.response';
import { containsInsensitive, pageArgs, termSearchWhere, toPage } from '../../../common/utils/pagination.util';
import { PrismaService } from '../../../core/database/prisma.service';
import { requireCrmMembership } from '../crm-membership';
import { normalizeEmail } from '../crm.constants';
import { resolveDefaultOrganizationId } from '../default-organization';
import { CreateLeadDTO } from './dto/create-lead.dto';
import { GetAllLeadsQueryDTO } from './dto/get-all-leads-query.dto';

@Injectable()
export class LeadsService {
  constructor(private prisma: PrismaService) {}

  async createLead(data: CreateLeadDTO): Promise<Lead> {
    const organizationId = await resolveDefaultOrganizationId(this.prisma);
    return this.prisma.lead.create({
      data: {
        ...data,
        email: normalizeEmail(data.email),
        organizationId,
      },
    });
  }

  async getStats(
    organizationId: string,
    userId: string,
  ): Promise<{ total: number; new: number; contacted: number; qualified: number; lost: number }> {
    await requireCrmMembership(this.prisma, organizationId, userId);
    const groups = await this.prisma.lead.groupBy({
      by: ['status'],
      where: { organizationId },
      _count: { _all: true },
    });
    const counts = new Map(groups.map((group) => [group.status, group._count._all]));
    const created = counts.get(LeadStatus.NEW) ?? 0;
    const contacted = counts.get(LeadStatus.CONTACTED) ?? 0;
    const qualified = counts.get(LeadStatus.QUALIFIED) ?? 0;
    const lost = counts.get(LeadStatus.LOST) ?? 0;
    return { total: created + contacted + qualified + lost, new: created, contacted, qualified, lost };
  }

  async getAllLeads(
    query: GetAllLeadsQueryDTO,
    organizationId: string,
    userId: string,
  ): Promise<PaginatedResponse<Lead>> {
    await requireCrmMembership(this.prisma, organizationId, userId);
    const where: Prisma.LeadWhereInput = {
      organizationId,
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
