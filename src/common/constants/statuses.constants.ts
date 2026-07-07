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
 * Legacy default statuses (seeded before SYSTEM_STATUSES existed) used different
 * names than the canonical set. Map each legacy name to its canonical equivalent
 * so self-healing can rename the existing row in place — promoting it to a system
 * status while preserving its id (and therefore every ticket pointing at it)
 * instead of leaving an orphaned duplicate. Categories already align via the
 * add_ticket_status_category backfill ('open' -> UNSTARTED = Todo,
 * 'cancelled' -> CANCELED = Canceled), so only the name needs normalizing.
 */
export const LEGACY_STATUS_NAME_MAP: Record<string, string> = {
  Cancelled: 'Canceled',
  Open: 'Todo',
};

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
