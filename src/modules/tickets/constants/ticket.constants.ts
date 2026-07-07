import { Prisma, TicketPriority, TicketStatusCategory } from "@prisma/client";

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

/** Lightweight summary of a linked ticket, embedded on the detail response. */
export const TICKET_RELATION_SELECT = {
  id: true,
  ticketNumber: true,
  title: true,
  ticketStatus: { select: { id: true, name: true, color: true } },
} satisfies Prisma.TicketsSelect;

export type TicketRelationSummary = Prisma.TicketsGetPayload<{ select: typeof TICKET_RELATION_SELECT }>;

/** Detail view also loads linked tickets (the list/facets endpoints don't need them). */
export const TICKET_DETAIL_INCLUDE = {
  ...TICKET_INCLUDE,
  relatedTickets: {
    orderBy: { createdAt: 'asc' },
    include: { relatedTicket: { select: TICKET_RELATION_SELECT } },
  },
} satisfies Prisma.TicketsInclude;

export type TicketWithDetailRelations = Prisma.TicketsGetPayload<{ include: typeof TICKET_DETAIL_INCLUDE }>;

/** Client-facing detail shape: the join rows are flattened to plain ticket summaries
 *  so `relatedTickets` reads as an array of tickets, not link records. */
export type TicketDetail = Omit<TicketWithDetailRelations, 'relatedTickets'> & {
  relatedTickets: TicketRelationSummary[];
};

export function serializeTicketDetail(ticket: TicketWithDetailRelations): TicketDetail {
  const { relatedTickets, ...rest } = ticket;
  return { ...rest, relatedTickets: relatedTickets.map((relation) => relation.relatedTicket) };
}

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

/** Board views shown as separated tabs in the ticket list. */
export const TICKET_VIEWS = ['backlog', 'active', 'closed', 'all'] as const;
export type TicketView = (typeof TICKET_VIEWS)[number];

/**
 * Which status lifecycle categories each board view includes. `all` applies no
 * category filter (it is intentionally absent here). Centralized so clients
 * never hardcode what "Backlog" or "Closed" mean — the server owns the mapping.
 */
export const TICKET_VIEW_CATEGORIES: Record<Exclude<TicketView, 'all'>, TicketStatusCategory[]> = {
  backlog: [TicketStatusCategory.BACKLOG],
  active: [TicketStatusCategory.UNSTARTED, TicketStatusCategory.STARTED],
  closed: [TicketStatusCategory.COMPLETED, TicketStatusCategory.CANCELED],
};

/** Faceted counts powering the view tabs and the filter menu badges. */
export interface TicketFacets {
  views: Record<TicketView, number>;
  statuses: { ticketStatusId: string; count: number }[];
  priorities: { priority: TicketPriority; count: number }[];
}
