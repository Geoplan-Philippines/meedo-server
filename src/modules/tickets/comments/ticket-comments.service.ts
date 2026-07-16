import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { TicketActivityType } from '@prisma/client';

import { PrismaService } from '../../../core/database/prisma.service';
import { PaginatedResponse, buildPaginationMeta } from 'src/common/responses/paginated-api.response';
import { PaginationQueryDTO } from 'src/common/dto/pagination-query.dto';
import { isOrgAdminRole } from 'src/common/constants/org-roles.constants';
import { CreateTicketCommentDTO } from './dto/create-ticket-comment.dto';
import { UpdateTicketCommentDTO } from './dto/update-ticket-comment.dto';
import { TicketActivityService } from '../activity/ticket-activity.service';
import { COMMENT_INCLUDE, COMMENT_THREAD_INCLUDE, CommentWithAuthor } from '../constants/ticket.constants';

export type CommentWithPermissions = CommentWithAuthor & { canModify: boolean };
/** A top-level comment plus its (one level of) replies, each with a canModify flag. */
export type CommentThreadItem = CommentWithPermissions & { replies: CommentWithPermissions[] };

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
  ): Promise<PaginatedResponse<CommentThreadItem>> {
    await this.ensureTicketInOrg(ticketId, organizationId);
    const { page, limit } = query;

    const member = await this.activity.resolveMember(organizationId, userId);
    const isAdmin = isOrgAdminRole(member?.role);
    const canModify = (authorMemberId: string | null): boolean =>
      isAdmin || (!!member && authorMemberId === member.id);

    // Paginate top-level comments only; each carries its replies inline.
    const [comments, total] = await Promise.all([
      this.prisma.ticketComment.findMany({
        where: { ticketId, parentId: null },
        include: COMMENT_THREAD_INCLUDE,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.ticketComment.count({ where: { ticketId, parentId: null } }),
    ]);

    const data: CommentThreadItem[] = comments.map((comment) => ({
      ...comment,
      canModify: canModify(comment.authorMemberId),
      replies: comment.replies.map((reply) => ({
        ...reply,
        canModify: canModify(reply.authorMemberId),
      })),
    }));

    return { data, meta: buildPaginationMeta(total, page, limit) };
  }

  async addComment(
    ticketId: string,
    organizationId: string,
    userId: string | undefined,
    dto: CreateTicketCommentDTO,
  ): Promise<CommentThreadItem> {
    await this.ensureTicketInOrg(ticketId, organizationId);
    const authorMemberId = await this.activity.resolveMemberId(organizationId, userId);

    // Threads are one level deep: replying to a reply attaches to its top-level parent.
    let parentId: string | null = null;
    if (dto.parentId) {
      const parent = await this.prisma.ticketComment.findFirst({
        where: { id: dto.parentId, ticketId },
        select: { id: true, parentId: true },
      });
      if (!parent) {
        throw new NotFoundException('Parent comment not found on this ticket.');
      }
      parentId = parent.parentId ?? parent.id;
    }

    return this.prisma.$transaction(async (tx) => {
      const comment = await tx.ticketComment.create({
        data: {
          ticketId,
          authorMemberId,
          body: dto.body,
          parentId,
        },
        include: COMMENT_INCLUDE,
      });

      // Only top-level comments surface on the activity timeline; replies are a
      // sub-conversation and would otherwise flood it.
      if (!parentId) {
        await this.activity.record(tx, {
          ticketId,
          actorMemberId: authorMemberId,
          type: TicketActivityType.COMMENTED,
          meta: { commentId: comment.id },
        });
      }

      // The author just wrote it, so they can always modify it; a fresh
      // comment/reply has no replies of its own yet.
      return { ...comment, canModify: true, replies: [] };
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
