import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';

import { PaginatedResponse } from 'src/common/responses/paginated-api.response';
import { TicketCommentsService, CommentWithPermissions } from './services/ticket-comments.service';
import { CreateTicketCommentDTO } from './dto/create-ticket-comment.dto';
import { UpdateTicketCommentDTO } from './dto/update-ticket-comment.dto';
import { ActivityWithActor, CommentWithAuthor } from './constants/ticket.constants';
import { PaginationQueryDTO } from '../../common/dto/pagination-query.dto';
import { CurrentOrganizationId } from '../../common/decorators/current-organization-id.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@Controller('tickets')
export class TicketCommentsController {
  constructor(private readonly ticketCommentsService: TicketCommentsService) {}

  @AllowAnonymous()
  @Get(':ticketId/comments')
  async getComments(
    @Param('ticketId', ParseUUIDPipe) ticketId: string,
    @Query() query: PaginationQueryDTO,
    @CurrentOrganizationId() organizationId: string,
    @CurrentUser('id') userId: string,
  ): Promise<PaginatedResponse<CommentWithPermissions>> {
    return this.ticketCommentsService.getComments(ticketId, organizationId, userId, query);
  }

  @AllowAnonymous()
  @Post(':ticketId/comments')
  async addComment(
    @Param('ticketId', ParseUUIDPipe) ticketId: string,
    @Body() body: CreateTicketCommentDTO,
    @CurrentOrganizationId() organizationId: string,
    @CurrentUser('id') userId: string,
  ): Promise<CommentWithAuthor> {
    return this.ticketCommentsService.addComment(ticketId, organizationId, userId, body);
  }

  @AllowAnonymous()
  @Patch(':ticketId/comments/:commentId')
  async updateComment(
    @Param('ticketId', ParseUUIDPipe) ticketId: string,
    @Param('commentId', ParseUUIDPipe) commentId: string,
    @Body() body: UpdateTicketCommentDTO,
    @CurrentOrganizationId() organizationId: string,
    @CurrentUser('id') userId: string,
  ): Promise<CommentWithAuthor> {
    return this.ticketCommentsService.updateComment(commentId, ticketId, organizationId, userId, body);
  }

  @AllowAnonymous()
  @Delete(':ticketId/comments/:commentId')
  @HttpCode(204)
  async deleteComment(
    @Param('ticketId', ParseUUIDPipe) ticketId: string,
    @Param('commentId', ParseUUIDPipe) commentId: string,
    @CurrentOrganizationId() organizationId: string,
    @CurrentUser('id') userId: string,
  ): Promise<void> {
    return this.ticketCommentsService.deleteComment(commentId, ticketId, organizationId, userId);
  }

  @AllowAnonymous()
  @Get(':ticketId/activity')
  async getActivity(
    @Param('ticketId', ParseUUIDPipe) ticketId: string,
    @Query() query: PaginationQueryDTO,
    @CurrentOrganizationId() organizationId: string,
  ): Promise<PaginatedResponse<ActivityWithActor>> {
    return this.ticketCommentsService.getActivity(ticketId, organizationId, query);
  }
}
