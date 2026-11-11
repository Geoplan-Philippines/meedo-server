-- AlterTable
ALTER TABLE "tickets" ADD COLUMN     "created_by_id" TEXT;

-- AlterTable
ALTER TABLE "timesheet_entries" ADD COLUMN     "description" TEXT,
ADD COLUMN     "ticket_id" TEXT,
ALTER COLUMN "project_id" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "tickets_created_by_id_idx" ON "tickets"("created_by_id");

-- CreateIndex
CREATE INDEX "timesheet_entries_ticket_id_idx" ON "timesheet_entries"("ticket_id");

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timesheet_entries" ADD CONSTRAINT "timesheet_entries_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "tickets"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Preserve the earliest recorded creator; rows with no actor remain nullable.
UPDATE "tickets" AS t
SET "created_by_id" = reporter."user_id"
FROM (
  SELECT DISTINCT ON (a."ticket_id") a."ticket_id", m."user_id"
  FROM "ticket_activities" AS a
  LEFT JOIN "members" AS m ON m."id" = a."actor_member_id"
  WHERE a."type" = 'CREATED'
  ORDER BY a."ticket_id", a."created_at" ASC, a."id" ASC
) AS reporter
WHERE t."id" = reporter."ticket_id"
  AND t."created_by_id" IS NULL
  AND reporter."user_id" IS NOT NULL;
