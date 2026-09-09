import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../core/database/prisma.service';
import { PaginatedResponse, buildPaginationMeta } from 'src/common/responses/paginated-api.response';
import { CreateProjectDTO } from './dto/create-project.dto';
import { UpdateProjectDTO } from './dto/update-project.dto';
import { GetAllProjectsQueryDTO } from './dto/get-all-projects-query.dto';
import {
  INTERNAL_PROJECT_KEY,
  INTERNAL_PROJECT_SUFFIX,
  PROJECT_INCLUDE,
  PROJECT_SORTABLE_FIELDS,
  ProjectSortField,
  ProjectWithRelations,
  deriveProjectKey,
} from './constants/project.constants';

@Injectable()
export class ProjectsService {
  constructor(private readonly prisma: PrismaService) {}

  async getAllProjects(
    query: GetAllProjectsQueryDTO,
    organizationId: string,
  ): Promise<PaginatedResponse<ProjectWithRelations>> {
    const { page, limit, state, priority, leadMemberId, memberId, search, includeArchived } = query;

    const where: Prisma.ProjectWhereInput = {
      organizationId,
      ...(includeArchived ? {} : { isArchived: false }),
      ...(state?.length ? { state: { in: state } } : {}),
      ...(priority?.length ? { priority: { in: priority } } : {}),
      ...(leadMemberId ? { leadMemberId } : {}),
      ...(memberId ? { members: { some: { memberId } } } : {}),
      ...this.buildSearchWhere(search),
    };

    const [projects, total] = await Promise.all([
      this.prisma.project.findMany({
        where,
        include: PROJECT_INCLUDE,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: this.buildOrderBy(query.sortField, query.sortOrder),
      }),
      this.prisma.project.count({ where }),
    ]);

    return { data: projects, meta: buildPaginationMeta(total, page, limit) };
  }

  async getProjectById(id: string, organizationId: string): Promise<ProjectWithRelations> {
    const project = await this.prisma.project.findFirst({
      where: { id, organizationId },
      include: PROJECT_INCLUDE,
    });

    if (!project) {
      throw new NotFoundException('Project not found in this organization.');
    }

    return project;
  }

  async createProject(body: CreateProjectDTO, organizationId: string): Promise<ProjectWithRelations> {
    this.assertDateRange(body.startDate, body.targetDate);
    await this.validateReferences(body, organizationId);

    const key = body.key
      ? await this.assertKeyAvailable(body.key, organizationId)
      : await this.resolveAvailableKey(deriveProjectKey(body.name), organizationId);

    const memberIds = body.memberIds ? [...new Set(body.memberIds)] : [];

    return this.prisma.project.create({
      data: {
        name: body.name.trim(),
        key,
        description: body.description,
        state: body.state,
        priority: body.priority,
        startDate: body.startDate ? new Date(body.startDate) : undefined,
        targetDate: body.targetDate ? new Date(body.targetDate) : undefined,
        organization: { connect: { id: organizationId } },
        lead: body.leadMemberId ? { connect: { id: body.leadMemberId } } : undefined,
        workOrder: body.workOrderId ? { connect: { id: body.workOrderId } } : undefined,
        members: memberIds.length
          ? { createMany: { data: memberIds.map((memberId) => ({ memberId })) } }
          : undefined,
      },
      include: PROJECT_INCLUDE,
    });
  }

  async updateProject(
    id: string,
    body: UpdateProjectDTO,
    organizationId: string,
  ): Promise<ProjectWithRelations> {
    const existing = await this.prisma.project.findFirst({
      where: { id, organizationId },
      select: { id: true, key: true, isInternal: true, startDate: true, targetDate: true },
    });

    if (!existing) {
      throw new NotFoundException('Project not found in this organization.');
    }

    // Validate the dates the project will end up with, not just the ones supplied.
    this.assertDateRange(
      body.startDate ?? existing.startDate?.toISOString(),
      body.targetDate ?? existing.targetDate?.toISOString(),
    );
    await this.validateReferences(body, organizationId);

    if (body.key && body.key !== existing.key) {
      await this.assertKeyAvailable(body.key, organizationId, id);
    }

    const { memberIds, key, leadMemberId, workOrderId, startDate, targetDate, ...rest } = body;

    return this.prisma.$transaction(async (tx) => {
      await tx.project.update({
        where: { id },
        data: {
          ...rest,
          ...(rest.name !== undefined ? { name: rest.name.trim() } : {}),
          ...(key !== undefined ? { key } : {}),
          ...(startDate !== undefined ? { startDate: startDate ? new Date(startDate) : null } : {}),
          ...(targetDate !== undefined ? { targetDate: targetDate ? new Date(targetDate) : null } : {}),
          ...(leadMemberId !== undefined ? { leadMemberId: leadMemberId || null } : {}),
          ...(workOrderId !== undefined ? { workOrderId: workOrderId || null } : {}),
        },
      });

      if (memberIds !== undefined) {
        await tx.projectMember.deleteMany({ where: { projectId: id } });

        const uniqueIds = [...new Set(memberIds)];
        if (uniqueIds.length > 0) {
          await tx.projectMember.createMany({
            data: uniqueIds.map((memberId) => ({ projectId: id, memberId })),
          });
        }
      }

      return tx.project.findUniqueOrThrow({ where: { id }, include: PROJECT_INCLUDE });
    });
  }

  async archiveProject(id: string, organizationId: string): Promise<ProjectWithRelations> {
    return this.setProjectArchived(id, organizationId, true);
  }

  async restoreProject(id: string, organizationId: string): Promise<ProjectWithRelations> {
    return this.setProjectArchived(id, organizationId, false);
  }

  /**
   * Hard delete, allowed only for an empty, non-internal project. Anything with
   * history should be archived instead — the `Tickets.projectId` foreign key is
   * `Restrict`, so this would fail at the database anyway.
   */
  async deleteProject(id: string, organizationId: string): Promise<void> {
    const project = await this.prisma.project.findFirst({
      where: { id, organizationId },
      select: { id: true, isInternal: true, _count: { select: { tickets: true } } },
    });

    if (!project) {
      throw new NotFoundException('Project not found in this organization.');
    }
    if (project.isInternal) {
      throw new BadRequestException('The internal project cannot be deleted.');
    }
    if (project._count.tickets > 0) {
      throw new ConflictException(
        'This project still has tickets. Move or delete them first, or archive the project instead.',
      );
    }

    await this.prisma.project.delete({ where: { id } });
  }

  /**
   * The organization's catch-all project for work that is not tied to a client.
   * Created on first use so every organization always has somewhere to file a
   * ticket, and reused thereafter.
   */
  async getInternalProject(organizationId: string): Promise<ProjectWithRelations> {
    const existing = await this.prisma.project.findFirst({
      where: { organizationId, isInternal: true },
      include: PROJECT_INCLUDE,
    });

    if (existing) {
      return existing;
    }

    const organization = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { name: true },
    });

    if (!organization) {
      throw new NotFoundException('Organization not found.');
    }

    return this.prisma.project.create({
      data: {
        name: `${organization.name} - ${INTERNAL_PROJECT_SUFFIX}`,
        key: await this.resolveAvailableKey(INTERNAL_PROJECT_KEY, organizationId),
        description: 'Work that is not tied to a client, such as internal IT requests.',
        isInternal: true,
        organization: { connect: { id: organizationId } },
      },
      include: PROJECT_INCLUDE,
    });
  }

  /**
   * Returns the delivery project tied to an Apptivo work order, creating one on
   * first use. Every synced work order gets a matching row in the Projects tab.
   */
  async ensureProjectForWorkOrder(
    workOrderId: string,
    organizationId: string,
  ): Promise<ProjectWithRelations> {
    const existing = await this.prisma.project.findFirst({
      where: { workOrderId, organizationId },
      include: PROJECT_INCLUDE,
    });
    if (existing) {
      return existing;
    }

    const workOrder = await this.prisma.workOrder.findFirst({
      where: { id: workOrderId, organizationId },
      select: {
        id: true,
        workOrderNumber: true,
        customerName: true,
        client: { select: { customerName: true } },
      },
    });
    if (!workOrder) {
      throw new NotFoundException('Work order not found in this organization.');
    }

    const label =
      workOrder.workOrderNumber?.trim() ||
      workOrder.client?.customerName ||
      workOrder.customerName?.trim() ||
      'Work order';
    const key = await this.resolveAvailableKey(deriveProjectKey(label), organizationId);

    return this.prisma.project.create({
      data: {
        name: label,
        key,
        state: 'IN_PROGRESS',
        organization: { connect: { id: organizationId } },
        workOrder: { connect: { id: workOrderId } },
      },
      include: PROJECT_INCLUDE,
    });
  }

  /** Creates missing delivery projects for every active work order in the org. */
  async ensureProjectsForWorkOrders(organizationId: string): Promise<number> {
    const workOrders = await this.prisma.workOrder.findMany({
      where: { organizationId, isArchived: false },
      select: { id: true },
    });

    let created = 0;
    for (const workOrder of workOrders) {
      const exists = await this.prisma.project.findFirst({
        where: { workOrderId: workOrder.id, organizationId },
        select: { id: true },
      });
      if (!exists) {
        await this.ensureProjectForWorkOrder(workOrder.id, organizationId);
        created++;
      }
    }
    return created;
  }

  private async setProjectArchived(
    id: string,
    organizationId: string,
    isArchived: boolean,
  ): Promise<ProjectWithRelations> {
    const existing = await this.prisma.project.findFirst({
      where: { id, organizationId },
      select: { id: true, isArchived: true, isInternal: true },
    });

    if (!existing) {
      throw new NotFoundException('Project not found in this organization.');
    }
    if (existing.isInternal && isArchived) {
      throw new BadRequestException('The internal project cannot be archived.');
    }
    if (existing.isArchived === isArchived) {
      throw new BadRequestException(
        isArchived ? 'Project is already archived.' : 'Project is not archived.',
      );
    }

    return this.prisma.project.update({
      where: { id },
      data: { isArchived },
      include: PROJECT_INCLUDE,
    });
  }

  private async validateReferences(
    body: Partial<CreateProjectDTO>,
    organizationId: string,
  ): Promise<void> {
    if (body.leadMemberId) {
      const lead = await this.prisma.member.findFirst({
        where: { id: body.leadMemberId, organizationId },
        select: { id: true },
      });
      if (!lead) {
        throw new NotFoundException('Project lead not found in this organization.');
      }
    }

    if (body.memberIds?.length) {
      const uniqueIds = [...new Set(body.memberIds)];
      const count = await this.prisma.member.count({
        where: { id: { in: uniqueIds }, organizationId },
      });
      if (count !== uniqueIds.length) {
        throw new NotFoundException('One or more members not found in this organization.');
      }
    }

    if (body.workOrderId) {
      const workOrder = await this.prisma.workOrder.findFirst({
        where: { id: body.workOrderId, organizationId },
        select: { id: true },
      });
      if (!workOrder) {
        throw new NotFoundException('Work order not found in this organization.');
      }
    }
  }

  private async assertKeyAvailable(
    key: string,
    organizationId: string,
    excludeId?: string,
  ): Promise<string> {
    const conflict = await this.prisma.project.findFirst({
      where: { organizationId, key, ...(excludeId ? { id: { not: excludeId } } : {}) },
      select: { id: true },
    });

    if (conflict) {
      throw new ConflictException(`Project key "${key}" is already used in this organization.`);
    }

    return key;
  }

  /** Appends a numeric suffix until the derived key is free ("ENG", "ENG2", ...). */
  private async resolveAvailableKey(base: string, organizationId: string): Promise<string> {
    const taken = await this.prisma.project.findMany({
      where: { organizationId, key: { startsWith: base } },
      select: { key: true },
    });
    const takenKeys = new Set(taken.map((project) => project.key));

    if (!takenKeys.has(base)) {
      return base;
    }

    for (let suffix = 2; suffix <= 999; suffix++) {
      const candidate = `${base}${suffix}`;
      if (!takenKeys.has(candidate)) {
        return candidate;
      }
    }

    throw new ConflictException('Could not derive a free project key. Please supply one.');
  }

  private assertDateRange(startDate?: string | null, targetDate?: string | null): void {
    if (!startDate || !targetDate) {
      return;
    }
    if (new Date(targetDate).getTime() < new Date(startDate).getTime()) {
      throw new BadRequestException('Target date cannot be before the start date.');
    }
  }

  private buildSearchWhere(search: string | undefined): Prisma.ProjectWhereInput {
    if (!search) {
      return {};
    }
    return {
      OR: [
        { name: { contains: search, mode: 'insensitive' } },
        { key: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ],
    };
  }

  private buildOrderBy(
    sortField: string | undefined,
    sortOrder: 'asc' | 'desc' | undefined,
  ): Prisma.ProjectOrderByWithRelationInput {
    const field = (PROJECT_SORTABLE_FIELDS as readonly string[]).includes(sortField ?? '')
      ? (sortField as ProjectSortField)
      : 'createdAt';
    const direction: Prisma.SortOrder = sortOrder === 'asc' ? 'asc' : 'desc';
    return { [field]: direction };
  }
}
