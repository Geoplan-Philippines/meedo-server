import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { TicketActivityType } from '@prisma/client';

import { PrismaService } from '../../../core/database/prisma.service';
import { PaginatedResponse, buildPaginationMeta } from 'src/common/responses/paginated-api.response';
import { PaginationQueryDTO } from 'src/common/dto/pagination-query.dto';
import { isOrgAdminRole } from 'src/common/constants/org-roles.constants';
import { CreateTicketCommentDTO } from '../dto/create-ticket-comment.dto';
import { UpdateTicketCommentDTO } from '../dto/update-ticket-comment.dto';
import { TicketActivityService } from './ticket-activity.service';
import {
  ACTIVITY_INCLUDE,
  ActivityWithActor,
  COMMENT_INCLUDE,
  CommentWithAuthor,
} from '../constants/ticket.constants';

export type CommentWithPermissions = CommentWithAuthor & { canModify: boolean };

@Injectable()
export class TicketCommentsService {
  constructor(
    private prisma: PrismaService,
    private activity: TicketActivityService,
  ) {}

  async getComments(
    ticketId: string,
    organizationId: string,
    userId: string | undefined,
    query: PaginationQueryDTO,
  ): Promise<PaginatedResponse<CommentWithPermissions>> {
    await this.ensureTicketInOrg(ticketId, organizationId);
    const { page, limit } = query;

    const member = await this.activity.resolveMember(organizationId, userId);
    const isAdmin = isOrgAdminRole(member?.role);

    const [comments, total] = await Promise.all([
      this.prisma.ticketComment.findMany({
        where: { ticketId },
        include: COMMENT_INCLUDE,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.ticketComment.count({ where: { ticketId } }),
    ]);

    const data: CommentWithPermissions[] = comments.map((comment) => ({
      ...comment,
      canModify: isAdmin || (!!member && comment.authorMemberId === member.id),
    }));

    return { data, meta: buildPaginationMeta(total, page, limit) };
  }

  async addComment(
    ticketId: string,
    organizationId: string,
    userId: string | undefined,
    dto: CreateTicketCommentDTO,
  ): Promise<CommentWithAuthor> {
    await this.ensureTicketInOrg(ticketId, organizationId);
    const authorMemberId = await this.activity.resolveMemberId(organizationId, userId);

    return this.prisma.$transaction(async (tx) => {
      const comment = await tx.ticketComment.create({
        data: {
          ticketId,
          authorMemberId,
          body: dto.body,
        },
        include: COMMENT_INCLUDE,
      });

      await this.activity.record(tx, {
        ticketId,
        actorMemberId: authorMemberId,
        type: TicketActivityType.COMMENTED,
        meta: { commentId: comment.id },
      });

      return comment;
    });
  }

  async updateComment(
    commentId: string,
    ticketId: string,
    organizationId: string,
    userId: string | undefined,
    dto: UpdateTicketCommentDTO,
  ): Promise<CommentWithAuthor> {
    await this.ensureCanModifyComment(commentId, ticketId, organizationId, userId);

    return this.prisma.ticketComment.update({
      where: { id: commentId },
      data: { body: dto.body },
      include: COMMENT_INCLUDE,
    });
  }

  async deleteComment(
    commentId: string,
    ticketId: string,
    organizationId: string,
    userId: string | undefined,
  ): Promise<void> {
    await this.ensureCanModifyComment(commentId, ticketId, organizationId, userId);

    // Remove the comment together with its "commented" activity entry so the
    // timeline never references a comment that no longer exists.
    await this.prisma.$transaction([
      this.prisma.ticketActivity.deleteMany({
        where: {
          ticketId,
          type: TicketActivityType.COMMENTED,
          meta: { path: ['commentId'], equals: commentId },
        },
      }),
      this.prisma.ticketComment.delete({ where: { id: commentId } }),
    ]);
  }

  async getActivity(
    ticketId: string,
    organizationId: string,
    query: PaginationQueryDTO,
  ): Promise<PaginatedResponse<ActivityWithActor>> {
    await this.ensureTicketInOrg(ticketId, organizationId);
    const { page, limit } = query;

    const [activities, total] = await Promise.all([
      this.prisma.ticketActivity.findMany({
        where: { ticketId },
        include: ACTIVITY_INCLUDE,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.ticketActivity.count({ where: { ticketId } }),
    ]);

    return { data: activities, meta: buildPaginationMeta(total, page, limit) };
  }

  private async ensureTicketInOrg(ticketId: string, organizationId: string): Promise<void> {
    const ticket = await this.prisma.tickets.findFirst({
      where: { id: ticketId, organizationId },
      select: { id: true },
    });
    if (!ticket) {
      throw new NotFoundException('Ticket not found in this organization.');
    }
  }

  private async ensureCanModifyComment(
    commentId: string,
    ticketId: string,
    organizationId: string,
    userId: string | undefined,
  ): Promise<void> {
    const comment = await this.prisma.ticketComment.findFirst({
      where: { id: commentId, ticketId, ticket: { organizationId } },
      select: { authorMemberId: true },
    });
    if (!comment) {
      throw new NotFoundException('Comment not found.');
    }

    const member = await this.activity.resolveMember(organizationId, userId);
    const isAuthor = !!member && comment.authorMemberId === member.id;
    if (!isAuthor && !isOrgAdminRole(member?.role)) {
      throw new ForbiddenException('You can only modify your own comments unless you are an admin.');
    }
  }
}
