import { Controller, Get, Query } from '@nestjs/common';
import { ApiForbiddenResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentOrganizationId } from '../../../common/decorators/current-organization-id.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { ApiPaginatedResponse } from '../../../common/decorators/api-paginated-response.decorator';
import { PaginatedResponse } from '../../../common/responses/paginated-api.response';
import { GetMembersQueryDTO } from './dto/get-members-query.dto';
import { MembersService, type MemberListRow } from './members.service';
import { MemberListRowDTO } from './dto/member-response.dto';

@ApiTags('Settings - Members')
@Controller('settings/members')
export class MembersController {
  constructor(private readonly membersService: MembersService) {}

  @Get()
  @ApiOperation({
    summary: 'List organization members',
    description: 'Paginated members with their user. Search matches name and email; teamId narrows to one team.',
  })
  @ApiPaginatedResponse(MemberListRowDTO)
  @ApiForbiddenResponse({ description: 'Caller is not a member of the active organization' })
  listMembers(
    @Query() query: GetMembersQueryDTO,
    @CurrentOrganizationId() organizationId: string,
    @CurrentUser('id') userId: string,
  ): Promise<PaginatedResponse<MemberListRow>> {
    return this.membersService.listMembers(query, organizationId, userId);
  }
}
