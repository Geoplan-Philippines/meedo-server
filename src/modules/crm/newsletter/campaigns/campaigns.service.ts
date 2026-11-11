import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { NewsletterCampaignStatus, Prisma } from '@prisma/client';
import { isOrgAdminRole } from '../../../../common/constants/org-roles.constants';
import { buildPaginationMeta } from '../../../../common/responses/paginated-api.response';
import { PrismaService } from '../../../../core/database/prisma.service';
import { CreateCampaignDTO } from './dto/create-campaign.dto';
import { GetAllCampaignsQueryDTO } from './dto/get-all-campaigns-query.dto';
import { UpdateCampaignDTO } from './dto/update-campaign.dto';

@Injectable()
export class CampaignsService {
  constructor(private readonly prisma: PrismaService) {}

  // Same compound membership lookup as tickets; campaigns have no department scope.
  private async actor(organizationId: string, userId: string, mutation = false) {
    if (!organizationId || !userId) throw new ForbiddenException('A signed-in organization member is required.');
    const member = await this.prisma.member.findUnique({
      where: { organizationId_userId: { organizationId, userId } },
      select: { id: true, role: true },
    });
    if (!member) throw new ForbiddenException('You are not a member of this organization.');
    if (mutation && !isOrgAdminRole(member.role)) throw new ForbiddenException('An organization owner or admin is required.');
    return member;
  }

  async list(query: GetAllCampaignsQueryDTO, organizationId: string, userId: string) {
    await this.actor(organizationId, userId);
    const { page, limit, includeArchived } = query;
    const search = query.search?.trim();
    const where: Prisma.NewsletterCampaignWhereInput = {
      organizationId,
      ...(includeArchived ? {} : { status: NewsletterCampaignStatus.DRAFT }),
      ...(search ? { OR: [
        { name: { contains: search, mode: 'insensitive' as const } },
        { subject: { contains: search, mode: 'insensitive' as const } },
      ] } : {}),
    };
    const [data, total] = await Promise.all([
      this.prisma.newsletterCampaign.findMany({
        where, skip: (page - 1) * limit, take: limit,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      }),
      this.prisma.newsletterCampaign.count({ where }),
    ]);
    return { data, meta: buildPaginationMeta(total, page, limit) };
  }

  async get(id: string, organizationId: string, userId: string) {
    await this.actor(organizationId, userId);
    return this.find(id, organizationId);
  }

  async create(data: CreateCampaignDTO, organizationId: string, userId: string) {
    const member = await this.actor(organizationId, userId, true);
    return this.prisma.newsletterCampaign.create({ data: {
      name: data.name.trim(), subject: data.subject.trim(), body: data.body.trim(),
      organizationId, createdByMemberId: member.id,
    } });
  }

  async update(id: string, data: UpdateCampaignDTO, organizationId: string, userId: string) {
    await this.actor(organizationId, userId, true);
    return this.prisma.$transaction(async tx => {
      const campaign = await this.find(id, organizationId, tx);
      if (campaign.status !== NewsletterCampaignStatus.DRAFT) throw new BadRequestException('Only drafts can be edited.');
      // Keep the status predicate on the write as well, so a concurrent archive wins.
      const result = await tx.newsletterCampaign.updateMany({
        where: { id, organizationId, status: NewsletterCampaignStatus.DRAFT },
        data: {
          ...(data.name !== undefined ? { name: data.name.trim() } : {}),
          ...(data.subject !== undefined ? { subject: data.subject.trim() } : {}),
          ...(data.body !== undefined ? { body: data.body.trim() } : {}),
        },
      });
      if (!result.count) throw new BadRequestException('Only drafts can be edited.');
      return this.find(id, organizationId, tx);
    });
  }

  async archive(id: string, organizationId: string, userId: string) {
    return this.setStatus(id, NewsletterCampaignStatus.ARCHIVED, organizationId, userId);
  }

  async restore(id: string, organizationId: string, userId: string) {
    return this.setStatus(id, NewsletterCampaignStatus.DRAFT, organizationId, userId);
  }

  private async setStatus(id: string, status: NewsletterCampaignStatus, organizationId: string, userId: string) {
    await this.actor(organizationId, userId, true);
    return this.prisma.$transaction(async tx => {
      await this.find(id, organizationId, tx);
      await tx.newsletterCampaign.updateMany({ where: { id, organizationId }, data: { status } });
      return this.find(id, organizationId, tx);
    });
  }

  private async find(id: string, organizationId: string, client: Prisma.TransactionClient = this.prisma) {
    const campaign = await client.newsletterCampaign.findFirst({ where: { id, organizationId } });
    if (!campaign) throw new NotFoundException('Campaign not found in this organization.');
    return campaign;
  }
}
