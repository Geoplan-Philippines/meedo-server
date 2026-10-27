import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, TicketActivityType } from '@prisma/client';

import { PrismaService } from '../../../core/database/prisma.service';
import { PaginatedResponse, buildPaginationMeta } from 'src/common/responses/paginated-api.response';
import { PaginationQueryDTO } from 'src/common/dto/pagination-query.dto';
import { CreateTicketCommentDTO } from './dto/create-ticket-comment.dto';
import { UpdateTicketCommentDTO } from './dto/update-ticket-comment.dto';
import { TicketActivityService } from '../activity/ticket-activity.service';
import { COMMENT_INCLUDE, COMMENT_THREAD_INCLUDE, CommentWithAuthor } from '../constants/ticket.constants';
import { TicketDepartmentAccessService, TicketDepartmentScope } from '../access/ticket-department-access.service';

export type CommentWithPermissions = CommentWithAuthor & { canModify: boolean };
/** A top-level comment plus its (one level of) replies, each with a canModify flag. */
export type CommentThreadItem = CommentWithPermissions & { replies: CommentWithPermissions[] };

@Injectable()
export class TicketCommentsService {
  constructor(
    private prisma: PrismaService,
    private activity: TicketActivityService,
    private access: TicketDepartmentAccessService,
  ) {}

  async getComments(
    ticketId: string,
    organizationId: string,
    userId: string | undefined,
    query: PaginationQueryDTO,
  ): Promise<PaginatedResponse<CommentThreadItem>> {
    const scope = await this.access.resolve(organizationId, userId);
    await this.access.assertTicket(scope, ticketId);
    const { page, limit } = query;
    const canModify = (authorMemberId: string | null): boolean =>
      scope.isAdmin || authorMemberId === scope.memberId;
    const where = { ticketId, parentId: null, ticket: this.access.where(scope) };

    // Paginate top-level comments only; each carries its replies inline.
    const [comments, total] = await Promise.all([
      this.prisma.ticketComment.findMany({
        where,
        include: { ...COMMENT_THREAD_INCLUDE, replies: {
          ...COMMENT_THREAD_INCLUDE.replies,
          where: { ticketId, ticket: this.access.where(scope) },
        } },
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.ticketComment.count({ where }),
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
    return this.prisma.$transaction(async (tx) => {
      const scope = await this.access.resolve(organizationId, userId, tx);
      await this.access.assertTicket(scope, ticketId, tx);
      const authorMemberId = scope.memberId;

      // Threads are one level deep: replying to a reply attaches to its top-level parent.
      let parentId: string | null = null;
      if (dto.parentId) {
        const parent = await tx.ticketComment.findFirst({
          where: { id: dto.parentId, ticketId, ticket: this.access.where(scope) },
          select: { id: true, parentId: true },
        });
        if (!parent) {
          throw new NotFoundException('Parent comment not found on this ticket.');
        }
        parentId = parent.parentId ?? parent.id;
      }

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
    return this.prisma.$transaction(async (tx) => {
      const scope = await this.access.resolve(organizationId, userId, tx);
      await this.access.assertTicket(scope, ticketId, tx);
      await this.ensureCanModifyComment(commentId, ticketId, scope, tx);
      return tx.ticketComment.update({
        where: { id: commentId, ticket: this.access.where(scope) },
        data: { body: dto.body },
        include: COMMENT_INCLUDE,
      });
    });
  }

  async deleteComment(
    commentId: string,
    ticketId: string,
    organizationId: string,
    userId: string | undefined,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const scope = await this.access.resolve(organizationId, userId, tx);
      await this.access.assertTicket(scope, ticketId, tx);
      await this.ensureCanModifyComment(commentId, ticketId, scope, tx);
      // Keep comment removal and its timeline event atomic.
      await tx.ticketActivity.deleteMany({
        where: {
          ticketId,
          ticket: this.access.where(scope),
          type: TicketActivityType.COMMENTED,
          meta: { path: ['commentId'], equals: commentId },
        },
      });
      await tx.ticketComment.delete({ where: { id: commentId, ticket: this.access.where(scope) } });
    });
  }

  private async ensureCanModifyComment(
    commentId: string,
    ticketId: string,
    scope: TicketDepartmentScope,
    client: Prisma.TransactionClient,
  ): Promise<void> {
    const comment = await client.ticketComment.findFirst({
      where: { id: commentId, ticketId, ticket: this.access.where(scope) },
      select: { authorMemberId: true },
    });
    if (!comment) {
      throw new NotFoundException('Comment not found.');
    }

    const isAuthor = comment.authorMemberId === scope.memberId;
    if (!isAuthor && !scope.isAdmin) {
      throw new ForbiddenException('You can only modify your own comments unless you are an admin.');
    }
  }
}
