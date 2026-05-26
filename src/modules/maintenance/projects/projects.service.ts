import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import type { Project } from '@prisma/client';
import { env } from '../../../core/config/env.config';
import { PrismaService } from '../../../core/database/prisma.service';
import { PaginatedResponse } from 'src/common/responses/paginated-api.response';
import { GetAllProjectsQueryDTO } from './dto/get-all-projects-query.dto';
import { WorkOrder, ProjectInput, ApptivoResponse } from './types/project.type';

@Injectable()
export class ProjectsService {
  constructor(private prisma: PrismaService) {}

  async getAllProjects(query: GetAllProjectsQueryDTO): Promise<PaginatedResponse<Project>> {
    const { page, limit } = query;

    const [projects, total] = await Promise.all([
      this.prisma.project.findMany({
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.project.count(),
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

  async syncWorkOrdersFromApptivo() {
    const projects = (await this.fetchApptivoWorkOrders()).map(normalize);
    const apptivoIds = projects.map((p) => p.apptivoId);

    const upserts = projects.map(({ apptivoId, ...data }) =>
      this.prisma.project.upsert({
        where: { apptivoId },
        update: data,
        create: { apptivoId, ...data },
      }),
    );

    const purge = this.prisma.project.deleteMany({
      where: { apptivoId: { notIn: apptivoIds } },
    });

    const results = await this.prisma.$transaction([...upserts, purge]);
    const deleted = (results.at(-1) as { count: number }).count;

    return { synced: projects.length, deleted };
  }

  private async fetchApptivoWorkOrders(): Promise<WorkOrder[]> {
    const apptivoApiUrl = `${env.APPTIVO_API_RESOURCE}&numRecords=1000&apiKey=${env.APPTIVO_API_KEY}&accessKey=${env.APPTIVO_API_ACCESS_KEY}`;

    let payload: ApptivoResponse;
    try {
      const response = await fetch(apptivoApiUrl,
        { headers: { Accept: 'application/json' } }
      );

      if (!response.ok) {
        throw new HttpException('Failed to fetch Apptivo data', HttpStatus.BAD_GATEWAY);
      }

      payload = await response.json();
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new HttpException('Network error while fetching Apptivo data', HttpStatus.BAD_GATEWAY);
    }

    const items =
    payload?.data && 'data' in payload.data
      ? payload.data.data
      : payload?.data ?? payload;

    if (!Array.isArray(items)) {
      throw new HttpException('Unexpected Apptivo response structure', HttpStatus.INTERNAL_SERVER_ERROR);
    }

    return items as WorkOrder[];
  }
};

function normalize(wo: WorkOrder): ProjectInput {
  const total = Number(wo.total);
  const date = wo.reportedDate ? new Date(wo.reportedDate) : null;

  return {
    apptivoId: String(wo.id),
    workOrderNumber: wo.workOrderNumber || '',
    customerName: wo.customerName || '',
    status: wo.statusName || 'Unknown',
    total: Number.isFinite(total) ? total : 0,
    reportedDate: date && !isNaN(date.getTime()) ? date : null,
  };
}


