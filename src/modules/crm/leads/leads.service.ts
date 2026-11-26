import { BadRequestException, Injectable, NotFoundException, StreamableFile } from '@nestjs/common';
import { FieldCollection, Lead, LeadStatus, Prisma } from '@prisma/client';

import { PaginatedResponse } from '../../../common/responses/paginated-api.response';
import { containsInsensitive, pageArgs, termSearchWhere, toPage } from '../../../common/utils/pagination.util';
import { PrismaService } from '../../../core/database/prisma.service';
import { toCsv } from '../csv';
import { requireCrmMembership } from '../crm-membership';
import { normalizeEmail } from '../crm.constants';
import { resolveDefaultOrganizationId } from '../default-organization';
import { formatFieldValueErrors, parseFieldValues } from '../field-definitions/parse-field-values';
import { ChangeLeadStatusDTO } from './dto/change-lead-status.dto';
import { CreateLeadDTO } from './dto/create-lead.dto';
import { GetAllLeadsQueryDTO } from './dto/get-all-leads-query.dto';
import { LeadValuesDTO } from './dto/lead-values.dto';
import { asValueMap, leadCurrentValues, leadFieldValue, splitLeadValues } from './lead-record';

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
        values: {},
      },
    });
  }

  async createLeadManual(body: LeadValuesDTO, organizationId: string, userId: string): Promise<Lead> {
    await requireCrmMembership(this.prisma, organizationId, userId);
    const parsed = await this.parseValues(organizationId, body.values, { mode: 'create' });
    const { columns, custom } = splitLeadValues(parsed, {});
    return this.prisma.lead.create({
      data: {
        organizationId,
        firstName: String(columns.firstName ?? ''),
        lastName: String(columns.lastName ?? ''),
        email: normalizeEmail(String(columns.email ?? '')),
        company: (columns.company as string | null | undefined) ?? null,
        phoneNumber: (columns.phoneNumber as string | null | undefined) ?? null,
        message: String(columns.message ?? ''),
        source: (columns.source as string | null | undefined) ?? null,
        values: custom as Prisma.InputJsonValue,
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
      where: { organizationId, isArchived: false },
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
    const where = this.listWhere(query, organizationId);
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

  async getLead(id: string, organizationId: string, userId: string): Promise<Lead> {
    await requireCrmMembership(this.prisma, organizationId, userId);
    return this.find(id, organizationId);
  }

  async updateLeadValues(id: string, body: LeadValuesDTO, organizationId: string, userId: string): Promise<Lead> {
    await requireCrmMembership(this.prisma, organizationId, userId);
    const lead = await this.find(id, organizationId);
    const parsed = await this.parseValues(organizationId, body.values, {
      mode: 'update',
      current: leadCurrentValues(lead),
    });
    const { columns, custom } = splitLeadValues(parsed, asValueMap(lead.values));
    return this.prisma.lead.update({
      where: { id },
      data: {
        ...columns,
        ...(typeof columns.email === 'string' ? { email: normalizeEmail(columns.email) } : {}),
        values: custom as Prisma.InputJsonValue,
      },
    });
  }

  async changeLeadStatus(
    id: string,
    body: ChangeLeadStatusDTO,
    organizationId: string,
    userId: string,
  ): Promise<Lead> {
    await requireCrmMembership(this.prisma, organizationId, userId);
    await this.find(id, organizationId);
    await this.prisma.lead.updateMany({ where: { id, organizationId }, data: { status: body.status } });
    return this.find(id, organizationId);
  }

  async archiveLead(id: string, organizationId: string, userId: string): Promise<Lead> {
    return this.setArchived(id, true, organizationId, userId);
  }

  async restoreLead(id: string, organizationId: string, userId: string): Promise<Lead> {
    return this.setArchived(id, false, organizationId, userId);
  }

  async exportLeads(
    query: GetAllLeadsQueryDTO,
    organizationId: string,
    userId: string,
  ): Promise<{ file: StreamableFile; filename: string }> {
    await requireCrmMembership(this.prisma, organizationId, userId);
    const where = this.listWhere(query, organizationId);
    const [fields, leads] = await Promise.all([
      this.prisma.fieldDefinition.findMany({
        where: { organizationId, collection: FieldCollection.lead },
        orderBy: [{ position: 'asc' }, { id: 'asc' }],
      }),
      this.prisma.lead.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      }),
    ]);
    const headers = (fields.length ? fields : [
      { key: 'firstName', label: 'First name' },
      { key: 'lastName', label: 'Last name' },
      { key: 'email', label: 'Email' },
    ]).map((field) => field.label);
    const keys = (fields.length ? fields : [
      { key: 'firstName' },
      { key: 'lastName' },
      { key: 'email' },
    ]).map((field) => field.key);
    const rows = leads.map((lead) => keys.map((key) => leadFieldValue(lead, key)));
    const filename = 'leads.csv';
    return { file: new StreamableFile(toCsv(headers, rows)), filename };
  }

  private async setArchived(id: string, isArchived: boolean, organizationId: string, userId: string): Promise<Lead> {
    await requireCrmMembership(this.prisma, organizationId, userId);
    await this.find(id, organizationId);
    await this.prisma.lead.updateMany({ where: { id, organizationId }, data: { isArchived } });
    return this.find(id, organizationId);
  }

  private async find(id: string, organizationId: string): Promise<Lead> {
    const lead = await this.prisma.lead.findFirst({ where: { id, organizationId } });
    if (!lead) throw new NotFoundException('Lead not found in this organization.');
    return lead;
  }

  private listWhere(query: GetAllLeadsQueryDTO, organizationId: string): Prisma.LeadWhereInput {
    return {
      organizationId,
      isArchived: query.isArchived ?? false,
      ...(query.status ? { status: query.status } : {}),
      ...termSearchWhere<Prisma.LeadWhereInput>(query.search, (term) => [
        { firstName: containsInsensitive(term) },
        { lastName: containsInsensitive(term) },
        { email: containsInsensitive(term) },
        { company: containsInsensitive(term) },
      ]),
    };
  }

  private async parseValues(
    organizationId: string,
    values: unknown,
    options: { mode: 'create' | 'update'; current?: Record<string, unknown> },
  ): Promise<Record<string, unknown>> {
    const definitions = await this.prisma.fieldDefinition.findMany({
      where: { organizationId, collection: FieldCollection.lead },
    });
    const result = parseFieldValues(definitions, values, options);
    if (!result.ok) throw new BadRequestException(formatFieldValueErrors(result.errors));
    return result.normalized;
  }
}
