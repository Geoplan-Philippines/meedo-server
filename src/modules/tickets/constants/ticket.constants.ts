import { Prisma, TicketPriority, TicketStatusCategory } from "@prisma/client";

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

/** Just enough of the owning project to render a ticket's "ENG-12" identifier. */
export const TICKET_PROJECT_SELECT = {
  id: true,
  name: true,
  key: true,
  state: true,
  isInternal: true,
} satisfies Prisma.ProjectSelect;

/** Optional Apptivo linkage, kept for client/billing context on client-facing tickets. */
export const TICKET_WORK_ORDER_SELECT = {
  id: true,
  workOrderNumber: true,
  customerName: true,
  client: { select: { customerName: true } },
} satisfies Prisma.WorkOrderSelect;

export const TICKET_INCLUDE = {
  ticketStatus: true,
  category: true,
  project: { select: TICKET_PROJECT_SELECT },
  workOrder: { select: TICKET_WORK_ORDER_SELECT },
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
  number: true,
  title: true,
  project: { select: { key: true } },
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

/** Human-facing ticket identifier, e.g. "ENG-12". */
export function formatTicketKey(projectKey: string, number: number): string {
  return `${projectKey}-${number}`;
}

/** Parses "ENG-12" / "eng 12" / "12" into the parts a lookup can filter on. */
export function parseTicketKey(input: string): { projectKey: string | null; number: number } | null {
  const match = input.trim().match(/^([a-zA-Z][a-zA-Z0-9]*)?[\s-]*(\d+)$/);
  if (!match) {
    return null;
  }
  return { projectKey: match[1]?.toUpperCase() ?? null, number: Number(match[2]) };
}

export const COMMENT_INCLUDE = {
  author: {
    include: { user: { select: TICKET_USER_SELECT } },
  },
} satisfies Prisma.TicketCommentInclude;

export type CommentWithAuthor = Prisma.TicketCommentGetPayload<{ include: typeof COMMENT_INCLUDE }>;

/** Thread view: top-level comments with one level of nested replies. */
export const COMMENT_THREAD_INCLUDE = {
  author: {
    include: { user: { select: TICKET_USER_SELECT } },
  },
  replies: {
    include: { author: { include: { user: { select: TICKET_USER_SELECT } } } },
    orderBy: { createdAt: 'asc' },
  },
} satisfies Prisma.TicketCommentInclude;

export type CommentWithReplies = Prisma.TicketCommentGetPayload<{ include: typeof COMMENT_THREAD_INCLUDE }>;

export const ACTIVITY_INCLUDE = {
  actor: {
    include: { user: { select: TICKET_USER_SELECT } },
  },
} satisfies Prisma.TicketActivityInclude;

export type ActivityWithActor = Prisma.TicketActivityGetPayload<{ include: typeof ACTIVITY_INCLUDE }>;

export const TICKET_SORTABLE_FIELDS = ['title', 'priority', 'dueDate', 'createdAt', 'number'] as const;
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
