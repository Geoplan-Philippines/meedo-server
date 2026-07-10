import { Controller, Get, Query } from '@nestjs/common';
import { Client } from '@prisma/client';
import { CurrentOrganizationId } from '../../../common/decorators/current-organization-id.decorator';
import { PaginatedResponse } from 'src/common/responses/paginated-api.response';
import { ClientsService } from './clients.service';
import { GetAllClientsQueryDTO } from './dto/get-all-clients-query.dto';

@Controller('maintenance/clients')
export class ClientsController {
  constructor(private readonly clientsService: ClientsService) {}

  @Get()
  async getAllClients(
    @Query() query: GetAllClientsQueryDTO,
    @CurrentOrganizationId() organizationId: string,
  ): Promise<PaginatedResponse<Client>> {
    return this.clientsService.getAllClients(query, organizationId);
  }

  @Get('sync')
  async syncClients(
    @CurrentOrganizationId() organizationId: string,
  ): Promise<{ message: string; synced: number; deleted: number }> {
    const { synced, deleted } = await this.clientsService.syncClientsFromApptivo(organizationId);
    return { message: 'Client sync complete', synced, deleted };
  }
}
