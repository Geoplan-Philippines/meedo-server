import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { env } from '../../../core/config/env.config';
import { PrismaService } from '../../../core/database/prisma.service';
import { PaginatedResponse } from 'src/common/responses/paginated-api.response';
import { GetAllWorkOrdersQueryDTO } from './dto/get-all-work-orders-query.dto';
import { ApptivoWorkOrder, WorkOrderInput, ApptivoResponse } from './types/work-order.type';
import { ClientsService } from '../clients/clients.service';
import { ProjectsService } from '../../projects/projects.service';

const WORK_ORDER_INCLUDE = {
  client: true,
} satisfies Prisma.WorkOrderInclude;

export type WorkOrderWithClient = Prisma.WorkOrderGetPayload<{ include: typeof WORK_ORDER_INCLUDE }>;

export interface WorkOrderSyncResult {
  synced: number;
  skipped: number;
  archived: number;
  restored: number;
  projectsCreated: number;
}

@Injectable()
export class WorkOrdersService {
  private readonly logger = new Logger(WorkOrdersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly clientsService: ClientsService,
    private readonly projectsService: ProjectsService,
  ) {}

  async getAllWorkOrders(
    query: GetAllWorkOrdersQueryDTO,
    organizationId: string,
  ): Promise<PaginatedResponse<WorkOrderWithClient>> {
    const { page, limit, clientId, includeArchived } = query;

    const where: Prisma.WorkOrderWhereInput = {
      organizationId,
      ...(clientId ? { clientId } : {}),
      ...(includeArchived ? {} : { isArchived: false }),
    };

    const [workOrders, total] = await Promise.all([
      this.prisma.workOrder.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: WORK_ORDER_INCLUDE,
      }),
      this.prisma.workOrder.count({ where }),
    ]);

    return {
      data: workOrders,
      meta: {
        total,
        limit,
        page,
        lastPage: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Reconciles the local `work_orders` table against the Apptivo feed.
   *
   * Reconciliation is non-destructive: work orders that disappear upstream are
   * archived, never deleted. See `archive` below for why.
   */
  async syncWorkOrdersFromApptivo(organizationId: string): Promise<WorkOrderSyncResult> {
    await this.clientsService.syncClientsFromApptivo(organizationId);

    const apptivoWorkOrders = await this.fetchApptivoWorkOrders();

    // An empty feed is far more likely to be an upstream hiccup than a genuine
    // "every work order was removed", so never reconcile against it.
    if (apptivoWorkOrders.length === 0) {
      return { synced: 0, skipped: 0, archived: 0, restored: 0, projectsCreated: 0 };
    }

    const apptivoClientIds = [
      ...new Set(
        apptivoWorkOrders.map((wo) => wo.customerId).filter(Boolean).map((id) => String(id).trim()),
      ),
    ];

    const clientMap = await this.clientsService.getClientMap(organizationId, apptivoClientIds);

    const normalized = apptivoWorkOrders.map((wo) => normalizeWorkOrder(wo, clientMap));

    const linkable: typeof normalized = [];
    for (let i = 0; i < normalized.length; i++) {
      if (!normalized[i].clientId) {
        this.logger.warn(
          `Work order "${apptivoWorkOrders[i].workOrderNumber}" (customer: "${apptivoWorkOrders[i].customerName || 'unknown'}") could not be linked to a client — apptivoId "${apptivoWorkOrders[i].customerId}" not found in client map. Skipping upsert.`,
        );
      } else {
        linkable.push(normalized[i]);
      }
    }

    // The keep-list spans every work order Apptivo returned, including the ones
    // we could not link to a client. Those are skipped for upsert but must not
    // be archived: an unresolved client is a gap on our side, not evidence that
    // the work order is gone.
    const seenApptivoIds = normalized.map((wo) => wo.apptivoId);
    const linkableApptivoIds = linkable.map((wo) => wo.apptivoId);

    const restored = await this.prisma.workOrder.count({
      where: { organizationId, isArchived: true, apptivoId: { in: linkableApptivoIds } },
    });

    const upserts = linkable.map(({ apptivoId, clientId, ...data }) =>
      this.prisma.workOrder.upsert({
        where: { organizationId_apptivoId: { organizationId, apptivoId } },
        update: { ...data, clientId, isArchived: false, archivedAt: null },
        create: { apptivoId, ...data, clientId, organizationId },
      }),
    );

    // Soft delete rather than `deleteMany`. A hard delete orphaned tickets via
    // `onDelete: SetNull` and was rejected outright by timesheet entries via
    // `onDelete: Restrict`, which failed the entire sync transaction.
    const archive = this.prisma.workOrder.updateMany({
      where: { organizationId, apptivoId: { notIn: seenApptivoIds }, isArchived: false },
      data: { isArchived: true, archivedAt: new Date() },
    });

    const results = await this.prisma.$transaction([...upserts, archive]);
    const archived = (results.at(-1) as { count: number }).count;

    const projectsCreated = await this.projectsService.ensureProjectsForWorkOrders(organizationId);

    return {
      synced: linkable.length,
      skipped: normalized.length - linkable.length,
      archived,
      restored,
      projectsCreated,
    };
  }

  private async fetchApptivoWorkOrders(): Promise<ApptivoWorkOrder[]> {
    const allWorkOrders: ApptivoWorkOrder[] = [];
    let startIndex = 0;
    const batchSize = 500;
    const maxIterations = 20;
    let iterations = 0;
    let hitCap = false;

    while (iterations < maxIterations) {
      const url = `${env.APPTIVO_API_RESOURCE}&numRecords=${batchSize}&startIndex=${startIndex}&apiKey=${env.APPTIVO_API_KEY}&accessKey=${env.APPTIVO_API_ACCESS_KEY}`;

      let payload: ApptivoResponse<ApptivoWorkOrder>;
      try {
        const response = await fetch(url, { headers: { Accept: 'application/json' } });

        if (!response.ok) {
          throw new HttpException('Failed to fetch Apptivo data', HttpStatus.BAD_GATEWAY);
        }

        payload = await response.json();
      } catch (error) {
        if (error instanceof HttpException) throw error;
        throw new HttpException('Network error while fetching Apptivo data', HttpStatus.BAD_GATEWAY);
      }

      const items = payload?.data;

      if (!Array.isArray(items)) {
        throw new HttpException('Unexpected Apptivo response structure', HttpStatus.INTERNAL_SERVER_ERROR);
      }

      if (items.length === 0) break;

      allWorkOrders.push(...items);

      if (items.length < batchSize) break;

      startIndex += items.length;
      iterations++;

      if (iterations === maxIterations) {
        hitCap = true;
      }
    }

    if (hitCap) {
      throw new HttpException(
        'Apptivo fetch exceeded maximum page limit — sync aborted to prevent a partial reconcile',
        HttpStatus.BAD_GATEWAY,
      );
    }

    return allWorkOrders;
  }
}

function normalizeWorkOrder(
  wo: ApptivoWorkOrder,
  clientMap: Map<string, string>,
): WorkOrderInput & { apptivoId: string; clientId: string | null } {
  const total = Number(wo.total);
  const date = wo.reportedDate ? new Date(wo.reportedDate) : null;
  const apptivoClientId = wo.customerId ? String(wo.customerId).trim() : null;

  return {
    apptivoId: String(wo.id),
    workOrderNumber: wo.workOrderNumber || '',
    status: wo.statusName || 'Unknown',
    total: Number.isFinite(total) ? total : 0,
    reportedDate: date && !isNaN(date.getTime()) ? date : null,
    clientId: apptivoClientId ? (clientMap.get(apptivoClientId) ?? null) : null,
  };
}
