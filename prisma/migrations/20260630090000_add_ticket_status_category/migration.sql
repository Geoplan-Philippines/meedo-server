-- CreateEnum
CREATE TYPE "TicketStatusCategory" AS ENUM ('BACKLOG', 'UNSTARTED', 'STARTED', 'COMPLETED', 'CANCELED');

-- AlterTable
ALTER TABLE "ticket_status" ADD COLUMN     "category" "TicketStatusCategory" NOT NULL DEFAULT 'BACKLOG';

-- Backfill existing statuses from their name so current boards keep working.
-- Unknown names stay BACKLOG and can be re-categorized in settings.
UPDATE "ticket_status" SET "category" = 'UNSTARTED' WHERE lower("name") IN ('open', 'to do', 'todo', 'new', 'reopened');
UPDATE "ticket_status" SET "category" = 'STARTED'   WHERE lower("name") IN ('in progress', 'in review', 'on hold', 'pending', 'doing');
UPDATE "ticket_status" SET "category" = 'COMPLETED' WHERE lower("name") IN ('done', 'resolved', 'closed', 'completed');
UPDATE "ticket_status" SET "category" = 'CANCELED'  WHERE lower("name") IN ('cancelled', 'canceled', 'duplicate', 'rejected');

-- CreateIndex
CREATE INDEX "ticket_status_category_idx" ON "ticket_status"("category");
