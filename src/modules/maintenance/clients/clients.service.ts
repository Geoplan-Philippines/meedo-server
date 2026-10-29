import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { projectVisibility, visibleProjects } from '../projects/project-visibility';
import { CreateClientDTO } from './dto/create-client.dto';
import { APPTIVO_SOURCE_FILTER, isApptivoSource } from '../projects/utils/apptivo-source';
import { MaintenanceAuditEntity, Prisma } from '@prisma/client';
import { env } from '../../../core/config/env.config';
import { PrismaService } from '../../../core/database/prisma.service';
import { PaginatedResponse, PaginationMeta, buildPaginationMeta } from 'src/common/responses/paginated-api.response';
import { GetAllClientsQueryDTO } from './dto/get-all-clients-query.dto';
import { Customer, SyncCounts } from '../projects/types/project.type';
import { fetchApptivoPages } from '../projects/utils/fetch-apptivo-pages';
import { CLIENT_DISPLAY_NAME_SQL, clientDisplayName, normalizeDisplayName } from '../projects/utils/display-name';
import { diffFields, recordMaintenanceAudit, resolveAdminActor } from '../audit/maintenance-audit';
import { UpdateClientDTO } from './dto/update-client.dto';
import { GetClientTreeQueryDTO } from './dto/get-client-tree-query.dto';
import {
  APPTIVO_SYNC_TRANSACTION_OPTIONS,
  UNARCHIVE_DATA,
  archiveData,
} from '../projects/constants/apptivo-sync.constants';

const CLIENT_INCLUDE = {
  _count: { select: { projects: true } },
} satisfies Prisma.ClientInclude;

type ClientWithCount = Prisma.ClientGetPayload<{ include: typeof CLIENT_INCLUDE }>;

/** A client as the list returns it: shown name plus linked project counts. */
export type ClientView = ClientWithCount & {
  name: string;
  /** All linked projects, archived ones included (the value `sortField=projectCount` sorts by). */
  projectCount: number;
  /** Linked projects that are not archived. */
  activeProjectCount: number;
};

/** Lightweight row for client pickers. */
export type ClientOption = { id: string; name: string; customerName: string; isArchived: boolean };

/** Sidebar tree row: an active client and how many matching active projects it has. */
export type ClientTreeNode = { id: string; name: string; projectCount: number };

export type ClientRef = { id: string; customerName: string };

@Injectable()
export class ClientsService {
  private readonly logger = new Logger(ClientsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getAllClients(query: GetAllClientsQueryDTO, organizationId: string, userId?: string): Promise<PaginatedResponse<ClientView>> {
    const scope = await projectVisibility(this.prisma, organizationId, userId);
    const { page, limit, includeArchived } = query;
    const search = query.search?.trim();
    const sortOrder = query.sortOrder ?? 'desc';

    const where: Prisma.ClientWhereInput = {
      organizationId,
      ...(scope.isAdmin ? {} : { projects: { some: { organizationId, ...visibleProjects(scope) } } }),
      ...(includeArchived ? {} : { isArchived: false }),
      ...(search
        ? {
            OR: [
              { displayName: { contains: search, mode: 'insensitive' } },
              { customerName: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const orderBy: Prisma.ClientOrderByWithRelationInput =
      query.sortField === 'projectCount'
        ? { projects: { _count: sortOrder } }
        : { [query.sortField ?? 'createdAt']: sortOrder };

    const [clients, total] = await Promise.all([
      this.prisma.client.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: [orderBy, { id: 'asc' }],
        include: scope.isAdmin ? CLIENT_INCLUDE : { _count: { select: { projects: { where: visibleProjects(scope) } } } },
      }),
      this.prisma.client.count({ where }),
    ]);

    const activeCounts = await this.countActiveProjects(clients.map((c) => c.id), visibleProjects(scope));

    return {
      data: clients.map((client) => ({
        ...client,
        name: clientDisplayName(client),
        projectCount: client._count.projects,
        activeProjectCount: activeCounts.get(client.id) ?? 0,
      })),
      meta: {
        total,
        limit,
        page,
        lastPage: Math.ceil(total / limit),
      },
    };
  }

  /**
   * One page of the sidebar client tree: active clients sorted by shown name, each with its
   * count of active projects. With a Dept (team), only clients whose projects have a ticket
   * for that team. `meta.unassignedProjectCount` counts matching projects with no client,
   * so the tree can add an "Unassigned" node after the last page.
   */
  async getClientTree(
    query: GetClientTreeQueryDTO,
    organizationId: string,
    userId?: string,
  ): Promise<{ data: ClientTreeNode[]; meta: PaginationMeta & { unassignedProjectCount: number } }> {
    const scope = await projectVisibility(this.prisma, organizationId, userId);
    const { page, limit } = query;
    const search = query.search?.trim() || null;
    const teamId = query.teamId ?? null;

    const activeProjects = Prisma.sql`
      SELECT p.id, p.client_id
      FROM projects p
      WHERE p.organization_id = ${organizationId}
        AND p.is_archived = false
        AND (${scope.isAdmin} OR EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = p.id AND pm.organization_id = ${organizationId} AND pm.user_id = ${scope.userId}))
        AND (${teamId}::text IS NULL OR EXISTS (
          SELECT 1 FROM tickets t WHERE t.project_id = p.id AND t.team_id = ${teamId} AND t.is_archived = false
        ))
    `;
    const clientRows = Prisma.sql`
      SELECT c.id, ${CLIENT_DISPLAY_NAME_SQL} AS name, COUNT(a.id)::int AS project_count
      FROM clients c
      LEFT JOIN active a ON a.client_id = c.id
      WHERE c.organization_id = ${organizationId}
        AND c.is_archived = false
        AND (${search}::text IS NULL
          OR ${CLIENT_DISPLAY_NAME_SQL} ILIKE '%' || ${search} || '%'
          OR c.customer_name ILIKE '%' || ${search} || '%')
      GROUP BY c.id
      HAVING ((${scope.isAdmin} AND ${teamId}::text IS NULL AND ${!query.hasActiveProjects}) OR COUNT(a.id) > 0)
    `;

    const [rows, totals, unassigned] = await Promise.all([
      this.prisma.$queryRaw<{ id: string; name: string; project_count: number }[]>(Prisma.sql`
        WITH active AS (${activeProjects})
        SELECT * FROM (${clientRows}) AS tree
        ORDER BY LOWER(tree.name), tree.id
        LIMIT ${limit} OFFSET ${(page - 1) * limit}
      `),
      this.prisma.$queryRaw<{ count: bigint }[]>(Prisma.sql`
        WITH active AS (${activeProjects})
        SELECT COUNT(*) AS count FROM (${clientRows}) AS tree
      `),
      this.prisma.$queryRaw<{ count: bigint }[]>(Prisma.sql`
        WITH active AS (${activeProjects})
        SELECT COUNT(*) AS count FROM active WHERE client_id IS NULL
      `),
    ]);

    const total = Number(totals[0]?.count ?? 0);
    return {
      data: rows.map((row) => ({ id: row.id, name: row.name, projectCount: row.project_count })),
      meta: {
        ...buildPaginationMeta(total, page, limit),
        unassignedProjectCount: Number(unassigned[0]?.count ?? 0),
      },
    };
  }

  /** One client by id (for breadcrumbs and page titles). */
  async getClient(id: string, organizationId: string, userId?: string): Promise<ClientOption> {
    const scope = await projectVisibility(this.prisma, organizationId, userId);
    const client = await this.prisma.client.findFirst({
      where: { id, organizationId, ...(scope.isAdmin ? {} : { projects: { some: { organizationId, ...visibleProjects(scope) } } }) },
      select: { id: true, customerName: true, displayName: true, isArchived: true },
    });
    if (!client) throw new NotFoundException('Client not found in this organization.');
    return {
      id: client.id,
      customerName: client.customerName,
      isArchived: client.isArchived,
      name: clientDisplayName(client),
    };
  }

  /** Every client in the organization as { id, name }, sorted by shown name, for pickers and filters. */
  async getClientOptions(organizationId: string, includeArchived = false, userId?: string): Promise<ClientOption[]> {
    const scope = await projectVisibility(this.prisma, organizationId, userId);
    const clients = await this.prisma.client.findMany({
      where: { organizationId, ...(includeArchived ? {} : { isArchived: false }), ...(scope.isAdmin ? {} : { projects: { some: { organizationId, ...visibleProjects(scope) } } }) },
      select: { id: true, customerName: true, displayName: true, isArchived: true },
    });

    return clients
      .map(({ id, customerName, displayName, isArchived }) => ({
        id,
        customerName,
        isArchived,
        name: clientDisplayName({ customerName, displayName }),
      }))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  }

  /** Admin edit of the shown name. Blank or null resets it to the Apptivo customer name. Audited. */
  async updateClient(
    id: string,
    dto: UpdateClientDTO,
    organizationId: string,
    userId: string | undefined,
  ): Promise<ClientView> {
    const actorMemberId = await resolveAdminActor(this.prisma, organizationId, userId);
    const current = await this.prisma.client.findFirst({
      where: { id, organizationId },
      select: { id: true, displayName: true },
    });
    if (!current) throw new NotFoundException('Client not found in this organization.');

    const changes = diffFields(current, { displayName: normalizeDisplayName(dto.displayName) });

    if (Object.keys(changes).length > 0) {
      await this.prisma.$transaction(async (tx) => {
        await tx.client.update({ where: { id }, data: { displayName: changes.displayName.to as string | null } });
        await recordMaintenanceAudit(tx, {
          organizationId,
          entityType: MaintenanceAuditEntity.CLIENT,
          entityId: id,
          actorMemberId,
          changes,
        });
      });
    }

    const client = await this.prisma.client.findUniqueOrThrow({ where: { id }, include: CLIENT_INCLUDE });
    const activeCounts = await this.countActiveProjects([id]);
    return {
      ...client,
      name: clientDisplayName(client),
      projectCount: client._count.projects,
      activeProjectCount: activeCounts.get(id) ?? 0,
    };
  }

  private async countActiveProjects(clientIds: string[], visibility: Prisma.ProjectWhereInput = {}): Promise<Map<string, number>> {
    if (clientIds.length === 0) return new Map();
    const groups = await this.prisma.project.groupBy({
      by: ['clientId'],
      where: { clientId: { in: clientIds }, isArchived: false, ...visibility },
      _count: { _all: true },
    });
    return new Map(groups.map((group) => [group.clientId as string, group._count._all]));
  }

  /** Standalone client sync: fetches Apptivo customers and reconciles them in its own transaction. */
  async syncClientsFromApptivo(organizationId: string): Promise<SyncCounts> {
    const customers = await this.fetchApptivoCustomers();

    return this.prisma.$transaction(
      (tx) => this.reconcileClients(tx, organizationId, customers),
      APPTIVO_SYNC_TRANSACTION_OPTIONS,
    );
  }

  /**
   * Upserts clients by (organizationId, apptivoId), archives clients that Apptivo no longer
   * returns and un-archives ones that reappear. Never deletes. Runs on the caller's transaction
   * so the project sync can include it in a single atomic unit.
   */
  async reconcileClients(tx: Prisma.TransactionClient, organizationId: string, customers: Customer[]): Promise<SyncCounts> {
    const incoming = this.indexCustomersByApptivoId(customers);

    if (incoming.size === 0) {
      this.logger.warn(`Apptivo returned no valid customers for org ${organizationId}; skipping client reconciliation.`);
      return { synced: 0, created: 0, updated: 0, archived: 0, unarchived: 0 };
    }

    const existing = await tx.client.findMany({
      where: { organizationId, ...APPTIVO_SOURCE_FILTER, apptivoId: { not: null } },
      select: { apptivoId: true, customerName: true, isArchived: true },
    });
    const existingByApptivoId = new Map(existing.filter(c => isApptivoSource(c.apptivoId)).map((c) => [c.apptivoId, c]));

    const toCreate: Prisma.ClientCreateManyInput[] = [];
    let updated = 0;
    let unarchived = 0;

    for (const [apptivoId, customerName] of incoming) {
      const current = existingByApptivoId.get(apptivoId);

      if (!current) {
        if (customerName === '') {
          this.logger.warn(`Skipping new Apptivo customer ${apptivoId}: missing customerName.`);
          continue;
        }
        toCreate.push({ apptivoId, customerName, organizationId });
        continue;
      }

      // A blank name from Apptivo never overwrites a known name.
      const nameChanged = customerName !== '' && customerName !== current.customerName;
      if (!nameChanged && !current.isArchived) continue;

      if (nameChanged) {
        this.logger.log(`Client ${apptivoId} (org ${organizationId}) renamed "${current.customerName}" -> "${customerName}".`);
      }

      await tx.client.update({
        where: { organizationId_apptivoId: { organizationId, apptivoId } },
        data: { ...(nameChanged ? { customerName } : {}), ...(current.isArchived ? UNARCHIVE_DATA : {}) },
      });

      if (nameChanged) updated++;
      if (current.isArchived) unarchived++;
    }

    if (toCreate.length > 0) {
      await tx.client.createMany({ data: toCreate });
    }

    const { count: archived } = await tx.client.updateMany({
      where: { organizationId, ...APPTIVO_SOURCE_FILTER, isArchived: false, apptivoId: { not: null, notIn: Array.from(incoming.keys()) } },
      data: archiveData(),
    });

    return { synced: incoming.size, created: toCreate.length, updated, archived, unarchived };
  }

  /** Maps Apptivo apptivoId -> client db id and name. Includes archived clients so existing links resolve. */
  async getClientMap(
    organizationId: string,
    apptivoClientIds: string[],
    db: Prisma.TransactionClient = this.prisma,
  ): Promise<Map<string, ClientRef>> {
    const clients = await db.client.findMany({
      where: { organizationId, apptivoId: { in: apptivoClientIds } },
      select: { id: true, apptivoId: true, customerName: true },
    });

    return new Map(clients.filter(c => c.apptivoId !== null).map((c) => [c.apptivoId!, { id: c.id, customerName: c.customerName }]));
  }

  /** apptivoId -> trimmed customerName ('' when missing). First occurrence wins on duplicates. */
  private indexCustomersByApptivoId(customers: Customer[]): Map<string, string> {
    const byApptivoId = new Map<string, string>();

    for (const c of customers) {
      const apptivoId = c.customerId == null ? '' : String(c.customerId).trim();
      if (!isApptivoSource(apptivoId) || byApptivoId.has(apptivoId)) continue;
      byApptivoId.set(apptivoId, (c.customerName ?? '').trim());
    }

    return byApptivoId;
  }

  fetchApptivoCustomers(): Promise<Customer[]> {
    return fetchApptivoPages<Customer>(env.APPTIVO_CUSTOMERS_API_RESOURCE, 'customers', this.logger);
  }

  async createClient(dto: CreateClientDTO, organizationId: string, userId?: string) {
    await resolveAdminActor(this.prisma, organizationId, userId);
    const client = await this.prisma.client.create({ data: { organizationId, apptivoId: null, customerName: dto.name.trim(), displayName: dto.name.trim() }, include: CLIENT_INCLUDE });
    return { ...client, name: clientDisplayName(client), projectCount: 0, activeProjectCount: 0 };
  }
}
