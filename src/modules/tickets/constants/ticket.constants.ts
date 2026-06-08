import { Prisma } from "@prisma/client";

export const TICKET_NUMBER_MIN = 100000;
export const TICKET_NUMBER_MAX = 999999;
export const MAX_TICKET_NUMBER_RETRIES = 5;


export const TICKET_INCLUDE = {
  ticketStatus: true,
  category: true,
  project: true,
  team: true,
  assignees: {
    include: {
      member: {
        include: { user: { select: { id: true, name: true, email: true, image: true } } },
      },
    },
  },
} satisfies Prisma.TicketsInclude;

export type TicketWithRelations = Prisma.TicketsGetPayload<{ include: typeof TICKET_INCLUDE }>;