import { TicketStatusCategory } from '@prisma/client';

/**
 * Built-in "standard" statuses seeded into every organization. Marked isSystem
 * so they can't be edited, archived, or deleted — the fixed baseline workflow
 * every ticket can move through. Mirrors the client's STANDARD_STATUSES list.
 */
export const SYSTEM_STATUSES = [
  { name: 'Backlog',     color: '#94A3B8', category: TicketStatusCategory.BACKLOG },
  { name: 'Todo',        color: '#3B82F6', category: TicketStatusCategory.UNSTARTED },
  { name: 'In Progress', color: '#E8A317', category: TicketStatusCategory.STARTED },
  { name: 'In Review',   color: '#8B5CF6', category: TicketStatusCategory.STARTED },
  { name: 'Done',        color: '#3DBE81', category: TicketStatusCategory.COMPLETED },
  { name: 'Canceled',    color: '#FF4B4B', category: TicketStatusCategory.CANCELED },
] as const;

/**
 * Curated palette for custom (editable) statuses. Mirrors the client's swatch
 * options and is intentionally distinct from the SYSTEM_STATUSES hues so custom
 * statuses read as their own family. Create/update requests are rejected if the
 * color falls outside this set (see CreateStatusDTO).
 */
export const CUSTOM_STATUS_COLORS = [
  '#F97316', // Orange
  '#84CC16', // Lime
  '#14B8A6', // Teal
  '#06B6D4', // Cyan
  '#D946EF', // Fuchsia
  '#EC4899', // Pink
] as const;
