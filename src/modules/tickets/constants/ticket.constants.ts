import { Prisma } from "@prisma/client";

export const TICKET_NUMBER_MIN = 100000;
export const TICKET_NUMBER_MAX = 999999;
export const MAX_TICKET_NUMBER_RETRIES = 5;

export const TICKET_TITLE_MAX_LENGTH = 200;
export const TICKET_DESCRIPTION_MAX_LENGTH = 5000;
export const TICKET_COMMENT_MAX_LENGTH = 5000;

/** Shared shape for exposing a related user on tickets/comments/activity. */
export const TICKET_USER_SELECT = {
  id: true,
  name: true,
  email: true,
  image: true,
} satisfies Prisma.UserSelect;

export const TICKET_INCLUDE = {
  ticketStatus: true,
  category: true,
  project: true,
  team: true,
  assignees: {
    include: {
      member: {
        include: { user: { select: TICKET_USER_SELECT } },
      },
    },
  },
} satisfies Prisma.TicketsInclude;

export type TicketWithRelations = Prisma.TicketsGetPayload<{ include: typeof TICKET_INCLUDE }>;

export const COMMENT_INCLUDE = {
  author: {
    include: { user: { select: TICKET_USER_SELECT } },
  },
} satisfies Prisma.TicketCommentInclude;

export type CommentWithAuthor = Prisma.TicketCommentGetPayload<{ include: typeof COMMENT_INCLUDE }>;

export const ACTIVITY_INCLUDE = {
  actor: {
    include: { user: { select: TICKET_USER_SELECT } },
  },
} satisfies Prisma.TicketActivityInclude;

export type ActivityWithActor = Prisma.TicketActivityGetPayload<{ include: typeof ACTIVITY_INCLUDE }>;

export const TICKET_SORTABLE_FIELDS = ['title', 'priority', 'dueDate', 'createdAt', 'ticketNumber'] as const;
export type TicketSortField = (typeof TICKET_SORTABLE_FIELDS)[number];

export interface TicketStats {
  total: number;
  urgent: number;
  high: number;
  overdue: number;
}
