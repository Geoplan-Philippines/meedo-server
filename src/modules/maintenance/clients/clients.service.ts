import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { Client } from '@prisma/client';
import { env } from '../../../core/config/env.config';
import { PrismaService } from '../../../core/database/prisma.service';
import { PaginatedResponse } from 'src/common/responses/paginated-api.response';
import { GetAllClientsQueryDTO } from './dto/get-all-clients-query.dto';
import { Customer, ClientInput, ApptivoResponse } from '../projects/types/project.type';

@Injectable()
export class ClientsService {
  constructor(private readonly prisma: PrismaService) {}

  async getAllClients(query: GetAllClientsQueryDTO, organizationId: string): Promise<PaginatedResponse<Client>> {
    const { page, limit } = query;

    const [clients, total] = await Promise.all([
      this.prisma.client.findMany({
        where: { organizationId },
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.client.count({ where: { organizationId } }),
    ]);

    return {
      data: clients,
      meta: {
        total,
        limit,
        page,
        lastPage: Math.ceil(total / limit),
      },
    };
  }

  async syncClientsFromApptivo(organizationId: string): Promise<{ synced: number; deleted: number }> {
    const customers = await this.fetchApptivoCustomers();
    const validCustomers = customers.filter((c) => c.customerId != null && String(c.customerId).trim() !== '');

    if (validCustomers.length === 0) {
      return { synced: 0, deleted: 0 };
    }

    const apptivoIds = validCustomers.map((c) => String(c.customerId).trim());

    const upserts = validCustomers.map((c) => {
      const apptivoId = String(c.customerId).trim();
      const data: ClientInput = {
        apptivoId,
        customerName: c.customerName || '',
      };

      return this.prisma.client.upsert({
        where: { organizationId_apptivoId: { organizationId, apptivoId } },
        update: { customerName: data.customerName },
        create: { ...data, organization: { connect: { id: organizationId } } },
      });
    });

    const purge = this.prisma.client.deleteMany({
      where: { organizationId, apptivoId: { notIn: apptivoIds } },
    });

    const results = await this.prisma.$transaction([...upserts, purge]);
    const deleted = (results.at(-1) as { count: number }).count;

    return { synced: validCustomers.length, deleted };
  }

  async getClientMap(organizationId: string, apptivoClientIds: string[]): Promise<Map<string, string>> {
    const clients = await this.prisma.client.findMany({
      where: { organizationId, apptivoId: { in: apptivoClientIds } },
      select: { id: true, apptivoId: true },
    });

    return new Map(clients.map((c) => [c.apptivoId, c.id]));
  }

  private async fetchApptivoCustomers(): Promise<Customer[]> {
    const allCustomers: Customer[] = [];
    let startIndex = 0;
    const batchSize = 500;
    const maxIterations = 20;
    let iterations = 0;
    let hitCap = false;

    while (iterations < maxIterations) {
      const url = `${env.APPTIVO_CUSTOMERS_API_RESOURCE}&numRecords=${batchSize}&startIndex=${startIndex}&apiKey=${env.APPTIVO_API_KEY}&accessKey=${env.APPTIVO_API_ACCESS_KEY}`;

      let payload: ApptivoResponse<Customer>;
      try {
        const response = await fetch(url, { headers: { Accept: 'application/json' } });

        if (!response.ok) {
          throw new HttpException('Failed to fetch Apptivo customers', HttpStatus.BAD_GATEWAY);
        }

        payload = await response.json();
      } catch (error) {
        if (error instanceof HttpException) throw error;
        throw new HttpException('Network error while fetching Apptivo customers', HttpStatus.BAD_GATEWAY);
      }

      const items = payload?.data;

      if (!Array.isArray(items)) {
        throw new HttpException('Unexpected Apptivo response structure', HttpStatus.INTERNAL_SERVER_ERROR);
      }

      if (items.length === 0) break;

      allCustomers.push(...items);

      if (items.length < batchSize) break;

      startIndex += items.length;
      iterations++;

      if (iterations === maxIterations) {
        hitCap = true;
      }
    }

    if (hitCap) {
      throw new HttpException(
        'Apptivo customer fetch exceeded maximum page limit — sync aborted to prevent partial purge',
        HttpStatus.BAD_GATEWAY,
      );
    }

    return allCustomers;
  }
}
