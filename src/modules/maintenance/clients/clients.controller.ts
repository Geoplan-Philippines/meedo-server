import { Controller, Get, Post, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';
import { CurrentOrganizationId } from '../../../common/decorators/current-organization-id.decorator';
import { PaginatedResponse } from 'src/common/responses/paginated-api.response';
import { ClientsService } from './clients.service';
import { GetAllClientsQueryDTO } from './dto/get-all-clients-query.dto';

@ApiTags('Clients')
@Controller('maintenance/clients')
export class ClientsController {
  constructor(private readonly clientsService: ClientsService) {}

  @AllowAnonymous()
  @Get()
  @ApiOperation({ summary: 'List clients', description: 'Paginated list of clients with project count.' })
  @ApiOkResponse({ description: 'Paginated clients with _count.projects' })
  async getAllClients(
    @Query() query: GetAllClientsQueryDTO,
    @CurrentOrganizationId() organizationId: string,
  ) {
    return this.clientsService.getAllClients(query, organizationId);
  }

  @AllowAnonymous()
  @Post('sync')
  @ApiOperation({ summary: 'Sync clients from Apptivo' })
  @ApiOkResponse({ description: 'Sync result with synced/deleted counts' })
  async syncClients(
    @CurrentOrganizationId() organizationId: string,
  ): Promise<{ message: string; synced: number; deleted: number }> {
    const { synced, deleted } = await this.clientsService.syncClientsFromApptivo(organizationId);
    return { message: 'Client sync complete', synced, deleted };
  }
}
