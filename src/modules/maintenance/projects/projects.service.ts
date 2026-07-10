import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import type { Project } from '@prisma/client';
import { env } from '../../../core/config/env.config';
import { PrismaService } from '../../../core/database/prisma.service';
import { PaginatedResponse } from 'src/common/responses/paginated-api.response';
import { GetAllProjectsQueryDTO } from './dto/get-all-projects-query.dto';
import { WorkOrder, ProjectInput, ApptivoResponse } from './types/project.type';
import { ClientsService } from '../clients/clients.service';

@Injectable()
export class ProjectsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clientsService: ClientsService,
  ) {}

  async getAllProjects(query: GetAllProjectsQueryDTO, organizationId: string): Promise<PaginatedResponse<Project>> {
    const { page, limit } = query;

    const [projects, total] = await Promise.all([
      this.prisma.project.findMany({
        where: { organizationId },
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: { client: true },
      }),
      this.prisma.project.count({ where: { organizationId } }),
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
    const workOrders = await this.fetchApptivoWorkOrders();

    if (workOrders.length === 0) {
      return { synced: 0, deleted: 0 };
    }

    const apptivoClientIds = [
      ...new Set(workOrders.map((wo) => wo.customerId).filter(Boolean).map((id) => String(id).trim())),
    ];

    const clientMap = await this.clientsService.getClientMap(organizationId, apptivoClientIds);

    const projects = workOrders.map((wo) => normalizeProject(wo, clientMap));
    const apptivoIds = projects.map((p) => p.apptivoId);

    const upserts = projects.map(({ apptivoId, clientId, ...data }) =>
      this.prisma.project.upsert({
        where: { apptivoId },
        update: { ...data, clientId: clientId ?? null },
        create: {
          apptivoId,
          ...data,
          clientId: clientId ?? null,
          organizationId,
        },
      }),
    );

    const purge = this.prisma.project.deleteMany({
      where: { organizationId, apptivoId: { notIn: apptivoIds } },
    });

    const results = await this.prisma.$transaction([...upserts, purge]);
    const deleted = (results.at(-1) as { count: number }).count;

    return { synced: projects.length, deleted };
  }

  private async fetchApptivoWorkOrders(): Promise<WorkOrder[]> {
    const url = `${env.APPTIVO_API_RESOURCE}&numRecords=1000&apiKey=${env.APPTIVO_API_KEY}&accessKey=${env.APPTIVO_API_ACCESS_KEY}`;

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

    return items;
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
    apptivoId:       String(wo.id),
    workOrderNumber: wo.workOrderNumber || '',
    customerName:    wo.customerName || '',
    status:          wo.statusName || 'Unknown',
    total:           Number.isFinite(total) ? total : 0,
    reportedDate:    date && !isNaN(date.getTime()) ? date : null,
    clientId:        apptivoClientId ? (clientMap.get(apptivoClientId) ?? null) : null,
  };
}
