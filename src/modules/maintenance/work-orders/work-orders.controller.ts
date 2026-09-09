import { Controller, Get, Post, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';
import { CurrentOrganizationId } from '../../../common/decorators/current-organization-id.decorator';
import { PaginatedResponse } from 'src/common/responses/paginated-api.response';
import { ApiPaginatedResponse } from '../../../common/decorators/api-paginated-response.decorator';
import {
  WorkOrdersService,
  type WorkOrderSyncResult,
  type WorkOrderWithClient,
} from './work-orders.service';
import { GetAllWorkOrdersQueryDTO } from './dto/get-all-work-orders-query.dto';
import { WorkOrderResponseDTO } from './dto/work-order-response.dto';

@ApiTags('Work Orders')
@Controller('maintenance/work-orders')
export class WorkOrdersController {
  constructor(private readonly workOrdersService: WorkOrdersService) {}

  @AllowAnonymous()
  @Get()
  @ApiOperation({
    summary: 'List work orders',
    description: 'Paginated list of Apptivo work orders, optionally filtered by client.',
  })
  @ApiPaginatedResponse(WorkOrderResponseDTO)
  async getAllWorkOrders(
    @Query() query: GetAllWorkOrdersQueryDTO,
    @CurrentOrganizationId() organizationId: string,
  ): Promise<PaginatedResponse<WorkOrderWithClient>> {
    return this.workOrdersService.getAllWorkOrders(query, organizationId);
  }

  @AllowAnonymous()
  @Post('sync')
  @ApiOperation({ summary: 'Sync work orders from Apptivo' })
  @ApiOkResponse({ description: 'Sync result with synced/skipped/archived/restored counts' })
  async syncWorkOrders(
    @CurrentOrganizationId() organizationId: string,
  ): Promise<{ message: string } & WorkOrderSyncResult> {
    const result = await this.workOrdersService.syncWorkOrdersFromApptivo(organizationId);
    return { message: 'Sync complete', ...result };
  }
}
