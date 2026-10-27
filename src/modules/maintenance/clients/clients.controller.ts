import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiForbiddenResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AllowAnonymous, OrgRoles, Session } from '@thallesp/nestjs-better-auth';
import type { UserSession } from '@thallesp/nestjs-better-auth';
import { CurrentOrganizationId } from '../../../common/decorators/current-organization-id.decorator';
import { getActiveOrganizationId } from '../../../common/utils/active-organization';
import { PaginatedResponse } from 'src/common/responses/paginated-api.response';
import { ClientsService, type ClientOption, type ClientView } from './clients.service';
import { ApiPaginatedResponse } from '../../../common/decorators/api-paginated-response.decorator';
import { ClientOptionDTO, ClientResponseDTO, ClientTreeNodeDTO } from './dto/client-response.dto';
import { GetAllClientsQueryDTO } from './dto/get-all-clients-query.dto';
import { GetClientOptionsQueryDTO } from './dto/get-client-options-query.dto';
import { GetClientTreeQueryDTO } from './dto/get-client-tree-query.dto';
import { UpdateClientDTO } from './dto/update-client.dto';
import { ClientSyncResultDTO } from '../projects/dto/sync-result.dto';

@ApiTags('Clients')
@Controller('maintenance/clients')
export class ClientsController {
  constructor(private readonly clientsService: ClientsService) {}

  @AllowAnonymous()
  @Get()
  @ApiOperation({
    summary: 'List clients',
    description: 'Paginated list of clients with project counts. Search matches display name and customer name.',
  })
  @ApiPaginatedResponse(ClientResponseDTO)
  async getAllClients(
    @Query() query: GetAllClientsQueryDTO,
    @CurrentOrganizationId() organizationId: string,
  ): Promise<PaginatedResponse<ClientView>> {
    return this.clientsService.getAllClients(query, organizationId);
  }

  @AllowAnonymous()
  @Get('options')
  @ApiOperation({ summary: 'All clients as { id, name } for pickers, sorted by shown name' })
  @ApiOkResponse({ type: ClientOptionDTO, isArray: true })
  async getClientOptions(
    @Query() query: GetClientOptionsQueryDTO,
    @CurrentOrganizationId() organizationId: string,
  ): Promise<ClientOption[]> {
    return this.clientsService.getClientOptions(organizationId, query.includeArchived);
  }

  @AllowAnonymous()
  @Get('tree')
  @ApiOperation({
    summary: 'Sidebar client tree page',
    description:
      'Active clients sorted by shown name with their active project count. teamId (Dept) keeps clients whose projects have a ticket for that team. meta.unassignedProjectCount counts matching projects with no client.',
  })
  @ApiPaginatedResponse(ClientTreeNodeDTO)
  async getClientTree(
    @Query() query: GetClientTreeQueryDTO,
    @CurrentOrganizationId() organizationId: string,
  ) {
    return this.clientsService.getClientTree(query, organizationId);
  }

  // Keep after the static GET routes ('options' / 'tree') so ':id' doesn't capture them.
  @AllowAnonymous()
  @Get(':id')
  @ApiOperation({ summary: 'One client (shown name and archive state)' })
  @ApiOkResponse({ type: ClientOptionDTO })
  async getClient(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentOrganizationId() organizationId: string,
  ): Promise<ClientOption> {
    return this.clientsService.getClient(id, organizationId);
  }

  @Patch(':id')
  @OrgRoles(['owner', 'admin'])
  @ApiOperation({ summary: 'Set or clear the client display name (org owner/admin)' })
  @ApiOkResponse({ type: ClientResponseDTO })
  @ApiForbiddenResponse({ description: 'Caller is not an owner or admin of the active organization' })
  async updateClient(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateClientDTO,
    @Session() session: UserSession,
  ): Promise<ClientView> {
    return this.clientsService.updateClient(id, body, getActiveOrganizationId(session), session.user.id);
  }

  @AllowAnonymous()
  @Post('sync')
  @ApiOperation({ summary: 'Sync clients from Apptivo' })
  @ApiOkResponse({ type: ClientSyncResultDTO, description: 'Created/updated/archived/unarchived counts. Nothing is deleted.' })
  async syncClients(@CurrentOrganizationId() organizationId: string): Promise<ClientSyncResultDTO> {
    const counts = await this.clientsService.syncClientsFromApptivo(organizationId);
    return { message: 'Client sync complete', ...counts };
  }
}
