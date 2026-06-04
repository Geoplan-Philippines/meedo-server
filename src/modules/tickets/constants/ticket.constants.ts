import { Prisma } from "@prisma/client";

export const TICKET_NUMBER_MIN = 100000;
export const TICKET_NUMBER_MAX = 999999;
export const MAX_TICKET_NUMBER_RETRIES = 5;


export const TICKET_INCLUDE = {
  ticketStatus: true,
  category: true,
  project: true,
  team: true,
  assignee: { include: { user: true } },
} satisfies Prisma.TicketsInclude;

export type TicketWithRelations = Prisma.TicketsGetPayload<{ include: typeof TICKET_INCLUDE }>;
