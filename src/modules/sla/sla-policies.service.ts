import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, TicketPriority } from '@prisma/client';

import { PrismaService } from '../../core/database/prisma.service';
import { assertProjectAssignable } from '../maintenance/projects/utils/assert-project-assignable';
import { PaginatedResponse } from 'src/common/responses/paginated-api.response';
import { CreateSlaPolicyDTO } from './dto/create-sla-policy.dto';
import { UpdateSlaPolicyDTO } from './dto/update-sla-policy.dto';
import { GetAllSlaPoliciesQueryDTO } from './dto/get-all-sla-policies-query.dto';

const SLA_POLICY_INCLUDE = {
  project: {
    select: {
      id:              true,
      workOrderNumber: true,
      displayName:     true,
      quoteSubject:    true,
      isArchived:      true,
      client:          { select: { customerName: true, displayName: true } },
    },
  },
} satisfies Prisma.SlaPolicyInclude;

type SlaPolicyWithRelations = Prisma.SlaPolicyGetPayload<{ include: typeof SLA_POLICY_INCLUDE }>;

@Injectable()
export class SlaPoliciesService {
  constructor(private readonly prisma: PrismaService) {}

  async getAllSlaPolicies(
    query: GetAllSlaPoliciesQueryDTO,
    organizationId: string,
  ): Promise<PaginatedResponse<SlaPolicyWithRelations>> {
    const { page, limit, isActive, priority, projectId } = query;

    const where: Prisma.SlaPolicyWhereInput = {
      organizationId,
      isArchived: false,
      ...(isActive !== undefined && { isActive }),
      ...(priority && { priority }),
      ...(projectId && { projectId }),
    };

    const [slaPolicies, total] = await Promise.all([
      this.prisma.slaPolicy.findMany({
        where,
        include: SLA_POLICY_INCLUDE,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.slaPolicy.count({ where }),
    ]);

    return {
      data: slaPolicies,
      meta: {
        total,
        limit,
        page,
        lastPage: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }

  async getSlaPolicyById(
    id: string,
    organizationId: string,
  ): Promise<SlaPolicyWithRelations> {
    const policy = await this.prisma.slaPolicy.findFirst({
      where: { id, organizationId, isArchived: false },
      include: SLA_POLICY_INCLUDE,
    });

    if (!policy) throw new NotFoundException('SLA policy not found.');

    return policy;
  }

  async createSlaPolicy(
    data: CreateSlaPolicyDTO,
    organizationId: string,
  ): Promise<SlaPolicyWithRelations> {
    await this.validateProjectReference(data.projectId, organizationId, null);
    await this.assertNoDuplicate(organizationId, data.projectId ?? null, data.priority);

    return this.prisma.slaPolicy.create({
      data: {
        name:                 data.name,
        priority:             data.priority,
        firstResponseMinutes: data.firstResponseMinutes,
        resolutionMinutes:    data.resolutionMinutes,
        businessHoursOnly:    data.businessHoursOnly ?? false,
        documentUrl:          data.documentUrl,
        organizationId,
        projectId:            data.projectId ?? null,
      },
      include: SLA_POLICY_INCLUDE,
    });
  }

  async updateSlaPolicy(
    id: string,
    data: UpdateSlaPolicyDTO,
    organizationId: string,
  ): Promise<SlaPolicyWithRelations> {
    const existing = await this.prisma.slaPolicy.findFirst({
      where: { id, organizationId, isArchived: false },
    });

    if (!existing) throw new NotFoundException('SLA policy not found.');

    const projectChanged = data.projectId !== undefined && data.projectId !== existing.projectId;
    const priorityChanged = data.priority !== undefined && data.priority !== existing.priority;

    if (projectChanged) {
      await this.validateProjectReference(data.projectId, organizationId, existing.projectId);
    }
    if (projectChanged || priorityChanged) {
      await this.assertNoDuplicate(
        organizationId,
        projectChanged ? (data.projectId ?? null) : existing.projectId,
        data.priority ?? existing.priority,
        id,
      );
    }

    const firstResponse = data.firstResponseMinutes ?? existing.firstResponseMinutes;
    const resolution    = data.resolutionMinutes    ?? existing.resolutionMinutes;
    if (resolution <= firstResponse) {
      throw new BadRequestException(
        'resolutionMinutes must be greater than firstResponseMinutes.',
      );
    }

    return this.prisma.slaPolicy.update({
      where: { id },
      data,
      include: SLA_POLICY_INCLUDE,
    });
  }

  async updateSlaPolicyDocument(
    id: string,
    organizationId: string,
    documentUrl: string,
  ): Promise<SlaPolicyWithRelations> {
    const existing = await this.prisma.slaPolicy.findFirst({
      where: { id, organizationId, isArchived: false },
    });

    if (!existing) throw new NotFoundException('SLA policy not found.');

    return this.prisma.slaPolicy.update({
      where: { id },
      data: { documentUrl },
      include: SLA_POLICY_INCLUDE,
    });
  }

  async removeSlaPolicyDocument(
    id: string,
    organizationId: string,
  ): Promise<SlaPolicyWithRelations> {
    const existing = await this.prisma.slaPolicy.findFirst({
      where: { id, organizationId, isArchived: false },
    });

    if (!existing) throw new NotFoundException('SLA policy not found.');
    if (!existing.documentUrl) throw new BadRequestException('No document attached to this policy.');

    return this.prisma.slaPolicy.update({
      where: { id },
      data: { documentUrl: null },
      include: SLA_POLICY_INCLUDE,
    });
  }

  async deleteSlaPolicy(id: string, organizationId: string): Promise<void> {
    const existing = await this.prisma.slaPolicy.findFirst({
      where: { id, organizationId, isArchived: false },
    });

    if (!existing) throw new NotFoundException('SLA policy not found.');

    await this.prisma.slaPolicy.update({
      where: { id },
      data: { isArchived: true },
    });
  }

  private async validateProjectReference(
    projectId: string | undefined,
    organizationId: string,
    currentProjectId: string | null,
  ): Promise<void> {
    if (!projectId) return;

    await assertProjectAssignable(this.prisma, projectId, organizationId, currentProjectId);
  }

  /**
   * One non-archived policy per organization + project + priority (project null = the
   * org-wide default for that priority). Policy matching picks by project and priority,
   * so two policies for the same pair would make the match ambiguous.
   */
  private async assertNoDuplicate(
    organizationId: string,
    projectId: string | null,
    priority: TicketPriority,
    excludeId?: string,
  ): Promise<void> {
    const conflict = await this.prisma.slaPolicy.findFirst({
      where: {
        organizationId,
        projectId,
        priority,
        isArchived: false,
        ...(excludeId && { id: { not: excludeId } }),
      },
      select: { id: true },
    });

    if (conflict) {
      throw new ConflictException(
        projectId
          ? `An SLA policy for this project and ${priority} priority already exists.`
          : `An organization-wide SLA policy for ${priority} priority already exists.`,
      );
    }
  }
}