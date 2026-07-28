import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { env } from '../../../core/config/env.config';
import { PrismaService } from '../../../core/database/prisma.service';
import { PaginatedResponse } from 'src/common/responses/paginated-api.response';
import { GetAllClientsQueryDTO } from './dto/get-all-clients-query.dto';
import { Customer, ClientInput, ApptivoResponse } from '../projects/types/project.type';

const CLIENT_INCLUDE = {
  _count: { select: { projects: true } },
} satisfies Prisma.ClientInclude;

type ClientWithCount = Prisma.ClientGetPayload<{ include: typeof CLIENT_INCLUDE }>;

@Injectable()
export class ClientsService {
  private readonly logger = new Logger(ClientsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getAllClients(query: GetAllClientsQueryDTO, organizationId: string): Promise<PaginatedResponse<ClientWithCount>> {
    const { page, limit } = query;

    const [clients, total] = await Promise.all([
      this.prisma.client.findMany({
        where: { organizationId },
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: CLIENT_INCLUDE,
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

    // (organizationId, customerName) is the canonical client identity.
    // If Apptivo sends the same name under multiple apptivoIds in one batch,
    // the first one seen wins; the rest are reconciled against it below.
    const byName = new Map<string, string>(); // customerName -> apptivoId
    for (const c of validCustomers) {
      const customerName = (c.customerName ?? '').trim();



      const apptivoId = String(c.customerId).trim();
      

      if (customerName === '') {
        this.logger.warn(`Skipping Apptivo customer ${apptivoId}: missing customerName, cannot resolve client identity.`);
        continue;
      }

      if (!byName.has(customerName)) {
        byName.set(customerName, apptivoId);
      }
    }

    const incomingNames = Array.from(byName.keys());

    const existingClients = await this.prisma.client.findMany({
      where: { organizationId, customerName: { in: incomingNames } },
      select: { customerName: true, apptivoId: true },
    });
    const existingByName = new Map(existingClients.map((c) => [c.customerName, c.apptivoId]));

    // Identity decision: (organizationId, customerName) is the canonical client identity.
    // Changed from apptivoId-based identity to name-based If this causes issues (e.g. orphaned
    // project links), consider switching to apptivoId-based identity or a hybrid approach
    // that reconciles apptivoIds on conflict.  
      for (const [customerName, apptivoId] of byName) {
      const existingApptivoId = existingByName.get(customerName);
      if (existingApptivoId && existingApptivoId !== apptivoId) {
        this.logger.warn(
          `Apptivo sent apptivoId "${apptivoId}" for existing client "${customerName}" (org ${organizationId}), which already has apptivoId "${existingApptivoId}". Keeping existing apptivoId — projects linked via this customerName will resolve to the old apptivoId and may be orphaned.`,
        );
      }
    }
    const toCreate = incomingNames.filter((name) => !existingByName.has(name));

    const [, { count: deleted }] = await this.prisma.$transaction([
      this.prisma.client.createMany({
        data: toCreate.map((name) => {
          const data: ClientInput = { apptivoId: byName.get(name)!, customerName: name };
          return { ...data, organizationId };
        }),
        skipDuplicates: true,
      }),
      this.prisma.client.deleteMany({
        where: { organizationId, customerName: { notIn: incomingNames } },
      }),
    ]);

    return { synced: incomingNames.length, deleted };
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
