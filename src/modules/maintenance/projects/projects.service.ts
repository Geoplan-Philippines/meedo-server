import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { projectVisibility, visibleProjects } from './project-visibility';
import { CreateProjectDTO } from './dto/create-project.dto';
import { NotificationsService } from '../../notifications/notifications.service';
import { NOTIFICATION_TYPES } from '../../notifications/notification.types';
import { APPTIVO_SOURCE_FILTER, isApptivoSource } from './utils/apptivo-source';
import { MaintenanceAuditEntity, Prisma, TicketPriority, TimesheetEntryStatus } from '@prisma/client';
import { env } from '../../../core/config/env.config';
import { PrismaService } from '../../../core/database/prisma.service';
import { PaginatedResponse } from 'src/common/responses/paginated-api.response';
import { GetAllProjectsQueryDTO } from './dto/get-all-projects-query.dto';
import { WorkOrder, ProjectSyncCounts } from './types/project.type';
import { APPTIVO_SYNC_TRANSACTION_OPTIONS, UNARCHIVE_DATA, archiveData } from './constants/apptivo-sync.constants';
import { ClientsService, type ClientRef } from '../clients/clients.service';
import { fetchApptivoPages } from './utils/fetch-apptivo-pages';
import { UpdateProjectDTO } from './dto/update-project.dto';
import { clientDisplayName, normalizeDisplayName, projectDisplayName } from './utils/display-name';
import {
  MAINTENANCE_AUDIT_HISTORY_LIMIT,
  MAINTENANCE_AUDIT_SELECT,
  MaintenanceAuditEntry,
  diffFields,
  recordMaintenanceAudit,
  resolveAdminActor,
} from '../audit/maintenance-audit';
import {
  ACTIVE_SLA_POLICY_WHERE,
  SLA_POLICY_RULE_SELECT,
  SlaPolicyRule,
  SlaPolicyScope,
  matchSlaPolicy,
} from '../../sla/sla-state';

const PROJECT_INCLUDE = {
  client: true,
} satisfies Prisma.ProjectInclude;

export type ProjectWithClient = Prisma.ProjectGetPayload<{ include: typeof PROJECT_INCLUDE }>;

/** A project as the API returns it: `name` is the shown name, and the client carries its shown name too. */
export type ProjectView = Omit<ProjectWithClient, 'client'> & {
  name: string;
  client: (NonNullable<ProjectWithClient['client']> & { name: string }) | null;
};

export type EffectiveSlaPolicy = SlaPolicyRule & { scope: SlaPolicyScope };

export type ProjectDetail = ProjectView & {
  ticketCount: number;
  openTicketCount: number;
  timesheetHours: number;
  approvedTimesheetHours: number;
  /** The policy each priority would use for this project's tickets (project policy, else org default). */
  slaPolicies: EffectiveSlaPolicy[];
  history: MaintenanceAuditEntry[];
};

export function toProjectView(project: ProjectWithClient): ProjectView {
  return {
    ...project,
    name: projectDisplayName(project),
    client: project.client ? { ...project.client, name: clientDisplayName(project.client) } : null,
  };
}

@Injectable()
export class ProjectsService {
  private readonly logger = new Logger(ProjectsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly clientsService: ClientsService,
    private readonly notifications: NotificationsService,
  ) {}

  async getAllProjects(query: GetAllProjectsQueryDTO, organizationId: string, userId?: string): Promise<PaginatedResponse<ProjectView>> {
    const scope = await projectVisibility(this.prisma, organizationId, userId);
    const { page, limit, clientId, includeArchived, status, unassigned, teamId } = query;
    const search = query.search?.trim();

    const where: Prisma.ProjectWhereInput = {
      organizationId,
      ...visibleProjects(scope),
      ...(query.includeClosed === false ? { isClosed: false } : {}),
      ...(unassigned ? { clientId: null } : clientId ? { clientId } : {}),
      ...(teamId ? { tickets: { some: { teamId, isArchived: false } } } : {}),
      ...(includeArchived ? {} : { isArchived: false }),
      ...(status ? { status } : {}),
      ...(search
        ? {
            OR: [
              { displayName: { contains: search, mode: 'insensitive' } },
              { quoteSubject: { contains: search, mode: 'insensitive' } },
              { workOrderNumber: { contains: search, mode: 'insensitive' } },
              { customerName: { contains: search, mode: 'insensitive' } },
              { client: { OR: [
                { displayName: { contains: search, mode: 'insensitive' } },
                { customerName: { contains: search, mode: 'insensitive' } },
              ] } },
            ],
          }
        : {}),
    };

    const [projects, total] = await Promise.all([
      this.prisma.project.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        // The id tiebreak keeps pages stable when the sort field has duplicates.
        orderBy: [{ [query.sortField ?? 'createdAt']: query.sortOrder ?? 'desc' }, { id: 'asc' }],
        include: PROJECT_INCLUDE,
      }),
      this.prisma.project.count({ where }),
    ]);

    return {
      data: projects.map(toProjectView),
      meta: {
        total,
        limit,
        page,
        lastPage: Math.ceil(total / limit),
      },
    };
  }

  /** Distinct Apptivo statuses in the organization, for the status filter. */
  async getStatuses(organizationId: string, userId?: string): Promise<string[]> {
    const scope = await projectVisibility(this.prisma, organizationId, userId);
    const rows = await this.prisma.project.findMany({
      where: { organizationId, ...visibleProjects(scope) },
      distinct: ['status'],
      select: { status: true },
      orderBy: { status: 'asc' },
    });
    return rows.map((row) => row.status);
  }

  async getProjectDetail(id: string, organizationId: string, userId?: string): Promise<ProjectDetail> {
    const scope = await projectVisibility(this.prisma, organizationId, userId);
    const project = await this.prisma.project.findFirst({ where: { id, organizationId, ...visibleProjects(scope) }, include: PROJECT_INCLUDE });
    if (!project) throw new NotFoundException('Project not found in this organization.');

    const [ticketCount, openTicketCount, hours, approvedHours, policies, history] = await Promise.all([
      this.prisma.tickets.count({ where: { projectId: id, organizationId, isArchived: false } }),
      this.prisma.tickets.count({ where: { projectId: id, organizationId, isArchived: false, resolvedAt: null } }),
      this.prisma.timesheetEntry.aggregate({ where: { projectId: id, organizationId }, _sum: { hours: true } }),
      this.prisma.timesheetEntry.aggregate({
        where: { projectId: id, organizationId, status: TimesheetEntryStatus.APPROVED },
        _sum: { hours: true },
      }),
      this.prisma.slaPolicy.findMany({
        where: { organizationId, ...ACTIVE_SLA_POLICY_WHERE, OR: [{ projectId: id }, { projectId: null }] },
        select: SLA_POLICY_RULE_SELECT,
      }),
      this.prisma.maintenanceAuditLog.findMany({
        where: { organizationId, entityType: MaintenanceAuditEntity.PROJECT, entityId: id },
        select: MAINTENANCE_AUDIT_SELECT,
        orderBy: { createdAt: 'desc' },
        take: MAINTENANCE_AUDIT_HISTORY_LIMIT,
      }),
    ]);

    const slaPolicies: EffectiveSlaPolicy[] = Object.values(TicketPriority).flatMap((priority) => {
      const policy = matchSlaPolicy(policies, { projectId: id, priority });
      return policy ? [{ ...policy, scope: policy.projectId ? 'project' : 'organization' }] : [];
    });

    return {
      ...toProjectView(project),
      ticketCount,
      openTicketCount,
      timesheetHours: hours._sum.hours ?? 0,
      approvedTimesheetHours: approvedHours._sum.hours ?? 0,
      slaPolicies,
      history,
    };
  }

  /**
   * Admin edit of the shown name and the client. Setting clientId locks the client against
   * the Apptivo sync (unless clientLocked: false is sent with it); clientLocked: false alone
   * hands it back to the sync. Every change is written to the maintenance audit log.
   */
  async updateProject(
    id: string,
    dto: UpdateProjectDTO,
    organizationId: string,
    userId: string | undefined,
  ): Promise<ProjectView> {
    const actorMemberId = await resolveAdminActor(this.prisma, organizationId, userId);
    const current = await this.prisma.project.findFirst({
      where: { id, organizationId },
      select: { id: true, displayName: true, clientId: true, clientLocked: true },
    });
    if (!current) throw new NotFoundException('Project not found in this organization.');

    if (dto.clientId) {
      await this.assertClientAssignable(dto.clientId, organizationId, current.clientId);
    }

    const changes = diffFields(current, {
      displayName: normalizeDisplayName(dto.displayName),
      clientId: dto.clientId,
      clientLocked: dto.clientId !== undefined ? (dto.clientLocked ?? true) : dto.clientLocked,
    });

    if (Object.keys(changes).length > 0) {
      const data = Object.fromEntries(Object.entries(changes).map(([field, change]) => [field, change.to]));

      await this.prisma.$transaction(async (tx) => {
        await tx.project.update({ where: { id }, data });
        await recordMaintenanceAudit(tx, {
          organizationId,
          entityType: MaintenanceAuditEntity.PROJECT,
          entityId: id,
          actorMemberId,
          changes,
        });
      });
    }

    return toProjectView(await this.prisma.project.findUniqueOrThrow({ where: { id }, include: PROJECT_INCLUDE }));
  }

  async createProject(dto: CreateProjectDTO, organizationId: string, userId?: string): Promise<ProjectView> {
    await resolveAdminActor(this.prisma, organizationId, userId);
    const client = await this.prisma.client.findFirst({ where: { id: dto.clientId, organizationId, isArchived: false } });
    if (!client) throw new NotFoundException('Choose an active client in this organization.');
    return toProjectView(await this.prisma.project.create({ data: {
      organizationId, clientId: client.id, apptivoId: null, displayName: dto.name.trim(),
      workOrderNumber: `INTERNAL-${randomUUID().slice(0, 8)}`, customerName: client.customerName,
      status: 'Internal', total: 0, clientLocked: true,
    }, include: PROJECT_INCLUDE }));
  }

  async setState(id: string, data: { isClosed?: boolean; isArchived?: boolean }, organizationId: string, userId?: string) {
    await resolveAdminActor(this.prisma, organizationId, userId);
    const current = await this.prisma.project.findFirst({ where: { id, organizationId } });
    if (!current) throw new NotFoundException('Project not found.');
    const updated = await this.prisma.project.update({ where: { id, organizationId }, data: {
      ...(data.isClosed !== undefined ? { isClosed: data.isClosed } : {}),
      ...(data.isArchived !== undefined ? { isArchived: data.isArchived, archivedManually: data.isArchived, archivedAt: data.isArchived ? new Date() : null } : {}),
    }, include: PROJECT_INCLUDE });
    if (data.isArchived !== undefined && data.isArchived !== current.isArchived) {
      try {
        const members = await this.prisma.projectMember.findMany({ where: { projectId: id, organizationId } });
        await this.notifications.createMany(members.map(member => ({ organizationId, recipientUserId: member.userId, actorUserId: userId,
          type: NOTIFICATION_TYPES.projectArchived, title: data.isArchived ? 'Project archived' : 'Project restored', body: projectDisplayName(updated),
          link: `/clients/${updated.clientId ?? 'unassigned'}/projects/${id}/tickets`, entityType: 'project', entityId: id })));
      } catch { this.logger.warn('Project archive notification failed after commit.'); }
    }
    return toProjectView(updated);
  }

  async listMembers(id: string, organizationId: string, userId?: string) {
    const scope = await projectVisibility(this.prisma, organizationId, userId);
    if (!await this.prisma.project.findFirst({ where: { id, organizationId, ...visibleProjects(scope) } })) throw new NotFoundException('Project not found.');
    return this.prisma.projectMember.findMany({ where: { projectId: id, organizationId }, include: { user: { select: { id: true, name: true, email: true } } }, orderBy: { createdAt: 'asc' } });
  }

  async memberOptions(organizationId: string, userId?: string) {
    await resolveAdminActor(this.prisma, organizationId, userId);
    return this.prisma.member.findMany({ where: { organizationId }, select: { user: { select: { id: true, name: true, email: true } } } });
  }

  async changeMember(id: string, recipientUserId: string, add: boolean, organizationId: string, userId?: string) {
    await resolveAdminActor(this.prisma, organizationId, userId);
    const project = await this.prisma.project.findFirst({ where: { id, organizationId } });
    if (!project) throw new NotFoundException('Project not found.');
    if (!await this.prisma.member.findUnique({ where: { organizationId_userId: { organizationId, userId: recipientUserId } } })) throw new NotFoundException('Organization member not found.');
    const result = add
      ? await this.prisma.projectMember.createMany({ data: [{ projectId: id, userId: recipientUserId, organizationId }], skipDuplicates: true })
      : await this.prisma.projectMember.deleteMany({ where: { projectId: id, userId: recipientUserId, organizationId } });
    if (result.count) {
      try { await this.notifications.create({ organizationId, recipientUserId, actorUserId: userId,
        type: add ? NOTIFICATION_TYPES.projectMemberAdded : NOTIFICATION_TYPES.projectMemberRemoved,
        title: add ? 'Added to project' : 'Removed from project', body: projectDisplayName(project),
        link: `/clients/${project.clientId ?? 'unassigned'}/projects/${id}/tickets`, entityType: 'project', entityId: id });
      } catch { this.logger.warn('Project membership notification failed after commit.'); }
    }
    return { changed: result.count > 0 };
  }

  /** The target client must be in the organization and active, unless the project already uses it. */
  private async assertClientAssignable(clientId: string, organizationId: string, currentClientId: string | null): Promise<void> {
    const client = await this.prisma.client.findFirst({
      where: { id: clientId, organizationId },
      select: { isArchived: true },
    });
    if (!client) throw new NotFoundException('Client not found in this organization.');
    if (client.isArchived && clientId !== currentClientId) {
      throw new BadRequestException('This client is archived because it no longer exists in Apptivo. Choose an active client.');
    }
  }

  /**
   * Full Apptivo sync. Both lists are fetched first; client reconciliation and project
   * reconciliation then run in one transaction, so any failure rolls back every change.
   */
  async syncWorkOrdersFromApptivo(organizationId: string): Promise<ProjectSyncCounts> {
    const customers = await this.clientsService.fetchApptivoCustomers();
    const workOrders = await this.fetchApptivoWorkOrders();

    return this.prisma.$transaction(async (tx) => {
      const clients = await this.clientsService.reconcileClients(tx, organizationId, customers);
      const projects = await this.reconcileProjects(tx, organizationId, workOrders);
      return { ...projects, clients };
    }, APPTIVO_SYNC_TRANSACTION_OPTIONS);
  }

  /**
   * Upserts projects by (organizationId, apptivoId), archives projects Apptivo no longer
   * returns and un-archives ones that reappear. Never deletes, so tickets, SLA policies and
   * timesheet entries keep their project. Unmatched customers never clear an existing link.
   * Admin-owned fields are left alone: displayName is never written, and a clientLocked
   * project keeps the client an admin set by hand.
   */
  private async reconcileProjects(
    tx: Prisma.TransactionClient,
    organizationId: string,
    workOrders: WorkOrder[],
  ): Promise<Omit<ProjectSyncCounts, 'clients'>> {
    const incoming = dedupeWorkOrders(workOrders);

    if (incoming.length === 0) {
      this.logger.warn(`Apptivo returned no valid work orders for org ${organizationId}; skipping project reconciliation.`);
      return { synced: 0, created: 0, updated: 0, archived: 0, unarchived: 0, unmatched: 0 };
    }

    const apptivoClientIds = [
      ...new Set(incoming.map((wo) => wo.customerId).filter((id) => id != null).map((id) => String(id).trim())),
    ];
    const clientMap = await this.clientsService.getClientMap(organizationId, apptivoClientIds, tx);

    const existing = await tx.project.findMany({ where: { organizationId, ...APPTIVO_SOURCE_FILTER, apptivoId: { not: null } }, select: PROJECT_SYNC_SELECT });
    const existingByApptivoId = new Map(existing.filter(p => isApptivoSource(p.apptivoId)).map((p) => [p.apptivoId, p]));

    const toCreate: Prisma.ProjectCreateManyInput[] = [];
    let updated = 0;
    let unarchived = 0;
    let unmatched = 0;

    for (const wo of incoming) {
      const project = normalizeProject(wo, clientMap);
      const current = existingByApptivoId.get(project.apptivoId);
      if (current?.archivedManually) continue;

      if (!project.clientId) {
        unmatched++;
        this.logUnmatchedWorkOrder(wo, current?.clientId ?? null);
      }

      if (!current) {
        toCreate.push({ ...project, customerName: project.customerName ?? '', organizationId });
        continue;
      }

      const changes = diffProject(current, {
        ...project,
        clientId: current.clientLocked ? current.clientId : (project.clientId ?? current.clientId),
        customerName: project.customerName ?? current.customerName,
      });
      if (!changes && !current.isArchived) continue;

      await tx.project.update({
        where: { id: current.id },
        data: { ...changes, ...(current.isArchived ? UNARCHIVE_DATA : {}) },
      });

      if (changes) updated++;
      if (current.isArchived) unarchived++;
    }

    if (toCreate.length > 0) {
      await tx.project.createMany({ data: toCreate });
    }

    const { count: archived } = await tx.project.updateMany({
      where: { organizationId, ...APPTIVO_SOURCE_FILTER, isArchived: false, apptivoId: { not: null, notIn: incoming.map((wo) => String(wo.id).trim()) } },
      data: archiveData(),
    });

    return { synced: incoming.length, created: toCreate.length, updated, archived, unarchived, unmatched };
  }

  private logUnmatchedWorkOrder(wo: WorkOrder, existingClientId: string | null): void {
    const outcome = existingClientId ? `keeping existing client ${existingClientId}` : 'storing with no client';
    this.logger.warn(
      `Work order "${wo.workOrderNumber}" (apptivoId ${wo.id}, customer "${wo.customerName || 'unknown'}") has customerId "${wo.customerId ?? ''}" that matches no client; ${outcome}.`,
    );
  }

  private fetchApptivoWorkOrders(): Promise<WorkOrder[]> {
    return fetchApptivoPages<WorkOrder>(env.APPTIVO_API_RESOURCE, 'work orders', this.logger);
  }
}

const PROJECT_SYNC_SELECT = {
  archivedManually: true,
  id: true,
  apptivoId: true,
  workOrderNumber: true,
  status: true,
  total: true,
  reportedDate: true,
  clientId: true,
  clientLocked: true,
  customerName: true,
  quoteSubject: true,
  apptivoQuoteRefId: true,
  isArchived: true,
} satisfies Prisma.ProjectSelect;

/** Work order custom attribute holding the subject of the sales quote it was converted from. */
const QUOTE_SUBJECT_ATTRIBUTE = 'referenceField_1617259959312_729_1007781617259959312_311';

type ProjectSyncSnapshot = Prisma.ProjectGetPayload<{ select: typeof PROJECT_SYNC_SELECT }>;

type NormalizedProject = ReturnType<typeof normalizeProject>;

/** Drops work orders without an id and keeps the first occurrence of each apptivoId. */
function dedupeWorkOrders(workOrders: WorkOrder[]): WorkOrder[] {
  const seen = new Set<string>();

  return workOrders.filter((wo) => {
    const apptivoId = wo.id == null ? '' : String(wo.id).trim();
    if (!isApptivoSource(apptivoId) || seen.has(apptivoId)) return false;
    seen.add(apptivoId);
    return true;
  });
}

/** Returns only the synced fields that differ from the stored row, or null when nothing changed. */
function diffProject(current: ProjectSyncSnapshot, next: NormalizedProject & { customerName: string }): Prisma.ProjectUncheckedUpdateInput | null {
  const changes: Prisma.ProjectUncheckedUpdateInput = {};

  if (next.workOrderNumber !== current.workOrderNumber) changes.workOrderNumber = next.workOrderNumber;
  if (next.status !== current.status) changes.status = next.status;
  if (next.total !== current.total) changes.total = next.total;
  if ((next.reportedDate?.getTime() ?? null) !== (current.reportedDate?.getTime() ?? null)) {
    changes.reportedDate = next.reportedDate;
  }
  if (next.clientId !== current.clientId) changes.clientId = next.clientId;
  if (next.customerName !== current.customerName) changes.customerName = next.customerName;
  if (next.quoteSubject !== current.quoteSubject) changes.quoteSubject = next.quoteSubject;
  if (next.apptivoQuoteRefId !== current.apptivoQuoteRefId) changes.apptivoQuoteRefId = next.apptivoQuoteRefId;

  return Object.keys(changes).length > 0 ? changes : null;
}

/** Trimmed string form of an Apptivo scalar, or null when missing or blank. */
function trimmedOrNull(value: unknown): string | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const trimmed = String(value).trim();
  return trimmed === '' ? null : trimmed;
}

/**
 * customerName is the matched client's name, else the name stored on the work order, else
 * null (the caller then keeps the stored value). quoteSubject and apptivoQuoteRefId are
 * read-only copies of Apptivo values, refreshed on every sync.
 */
function normalizeProject(
  wo: WorkOrder,
  clientMap: Map<string, ClientRef>,
): {
  apptivoId: string;
  workOrderNumber: string;
  status: string;
  total: number;
  reportedDate: Date | null;
  clientId: string | null;
  customerName: string | null;
  quoteSubject: string | null;
  apptivoQuoteRefId: string | null;
} {
  const total = Number(wo.total);
  const date = wo.reportedDate ? new Date(wo.reportedDate) : null;
  const apptivoClientId = wo.customerId ? String(wo.customerId).trim() : null;
  const client = apptivoClientId ? clientMap.get(apptivoClientId) : undefined;
  const quoteSubject = wo.customAttributes?.find((a) => a.customAttributeName === QUOTE_SUBJECT_ATTRIBUTE);

  return {
    apptivoId: String(wo.id).trim(),
    workOrderNumber: wo.workOrderNumber || '',
    status: wo.statusName || 'Unknown',
    total: Number.isFinite(total) ? total : 0,
    reportedDate: date && !isNaN(date.getTime()) ? date : null,
    clientId: client?.id ?? null,
    customerName: trimmedOrNull(client?.customerName) ?? trimmedOrNull(wo.customerName),
    quoteSubject: trimmedOrNull(quoteSubject?.customAttributeValue),
    apptivoQuoteRefId: trimmedOrNull(wo.fromObjectRefId),
  };
}
