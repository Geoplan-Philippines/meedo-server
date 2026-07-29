import { Controller, Get, Query } from '@nestjs/common';

import { PaginatedResponse } from 'src/common/responses/paginated-api.response';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { CurrentOrganizationId } from '../../../common/decorators/current-organization-id.decorator';
import { AttendanceService } from '../attendance.service';
import { AttendanceBoardService } from './attendance-board.service';
import { BoardRosterEntry, BoardSummary, TardinessResult } from './attendance-board.constants';
import { GetBoardRosterQueryDTO } from './dto/get-board-roster-query.dto';
import { GetTardinessQueryDTO } from './dto/get-tardiness-query.dto';

/**
 * Admin-only attendance board. Every endpoint is gated to organization managers:
 * the board is an org-wide overview, not a personal view.
 */
@Controller('attendance/board')
export class AttendanceBoardController {
  constructor(
    private readonly board: AttendanceBoardService,
    private readonly attendance: AttendanceService,
  ) {}

  @Get('summary')
  async getSummary(
    @CurrentOrganizationId() organizationId: string,
    @CurrentUser('id') callerId: string,
    @Query('date') date?: string,
  ): Promise<BoardSummary> {
    await this.attendance.assertOrgManager(callerId, organizationId);
    return this.board.getSummary(organizationId, date);
  }

  @Get('roster')
  async getRoster(
    @Query() query: GetBoardRosterQueryDTO,
    @CurrentOrganizationId() organizationId: string,
    @CurrentUser('id') callerId: string,
  ): Promise<PaginatedResponse<BoardRosterEntry>> {
    await this.attendance.assertOrgManager(callerId, organizationId);
    return this.board.getRoster(organizationId, query);
  }

  @Get('tardiness')
  async getTardiness(
    @Query() query: GetTardinessQueryDTO,
    @CurrentOrganizationId() organizationId: string,
    @CurrentUser('id') callerId: string,
  ): Promise<TardinessResult> {
    await this.attendance.assertOrgManager(callerId, organizationId);
    return this.board.getTardiness(organizationId, query);
  }
}
