import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { env } from '../../../core/config/env.config';
import { PrismaService } from '../../../core/database/prisma.service';
import { PaginatedResponse } from 'src/common/responses/paginated-api.response';
import { GetAllProjectsQueryDTO } from './dto/get-all-projects-query.dto';
import { WorkOrder, ProjectInput, ApptivoResponse } from './types/project.type';
import { ClientsService } from '../clients/clients.service';

const PROJECT_INCLUDE = {
  client: true,
} satisfies Prisma.ProjectInclude;

export type ProjectWithClient = Prisma.ProjectGetPayload<{ include: typeof PROJECT_INCLUDE }>;

@Injectable()
export class ProjectsService {
  private readonly logger = new Logger(ProjectsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly clientsService: ClientsService,
  ) {}

  async getAllProjects(query: GetAllProjectsQueryDTO, organizationId: string): Promise<PaginatedResponse<ProjectWithClient>> {
    const { page, limit, clientId } = query;

    const where = { organizationId, ...(clientId ? { clientId } : {}) };

    const [projects, total] = await Promise.all([
      this.prisma.project.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: PROJECT_INCLUDE,
      }),
      this.prisma.project.count({ where }),
    ]);

    return {
      data: projects,
      meta: {
        total,
        limit,
        page,
        lastPage: Math.ceil(total / limit),
      },
    };
  }

  async syncWorkOrdersFromApptivo(organizationId: string): Promise<{ synced: number; deleted: number }> {
    await this.clientsService.syncClientsFromApptivo(organizationId);

    const workOrders = await this.fetchApptivoWorkOrders();

    if (workOrders.length === 0) {
      return { synced: 0, deleted: 0 };
    }

    const apptivoClientIds = [
      ...new Set(workOrders.map((wo) => wo.customerId).filter(Boolean).map((id) => String(id).trim())),
    ];

    const clientMap = await this.clientsService.getClientMap(organizationId, apptivoClientIds);

    const projects = workOrders.map((wo) => normalizeProject(wo, clientMap));

    const validProjects: typeof projects = [];
    for (let i = 0; i < projects.length; i++) {
      if (!projects[i].clientId) {
        this.logger.warn(
          `Work order "${workOrders[i].workOrderNumber}" (customer: "${workOrders[i].customerName || 'unknown'}") could not be linked to a client — apptivoId "${workOrders[i].customerId}" not found in client map. Skipping project sync.`,
        );
      } else {
        validProjects.push(projects[i]);
      }
    }
    const apptivoIds = validProjects.map((p) => p.apptivoId);

    const upserts = validProjects.map(({ apptivoId, clientId, ...data }) =>
      this.prisma.project.upsert({
        where: { organizationId_apptivoId: { organizationId, apptivoId } },
        update: { ...data, clientId },
        create: {
          apptivoId,
          ...data,
          clientId,
          organizationId,
        },
      }),
    );

    const purge = this.prisma.project.deleteMany({
      where: { organizationId, apptivoId: { notIn: apptivoIds } },
    });

    const results = await this.prisma.$transaction([...upserts, purge]);
    const deleted = (results.at(-1) as { count: number }).count;

    return { synced: validProjects.length, deleted };
  }

  private async fetchApptivoWorkOrders(): Promise<WorkOrder[]> {
    const allWorkOrders: WorkOrder[] = [];
    let startIndex = 0;
    const batchSize = 500;
    const maxIterations = 20;
    let iterations = 0;
    let hitCap = false;

    while (iterations < maxIterations) {
      const url = `${env.APPTIVO_API_RESOURCE}&numRecords=${batchSize}&startIndex=${startIndex}&apiKey=${env.APPTIVO_API_KEY}&accessKey=${env.APPTIVO_API_ACCESS_KEY}`;

      let payload: ApptivoResponse<WorkOrder>;
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
        'Apptivo fetch exceeded maximum page limit — sync aborted to prevent partial purge',
        HttpStatus.BAD_GATEWAY,
      );
    }

    return allWorkOrders;
  }
}

function normalizeProject(
  wo: WorkOrder,
  clientMap: Map<string, string>,
): ProjectInput & { apptivoId: string; clientId: string | null } {
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
