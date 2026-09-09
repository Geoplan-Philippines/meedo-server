-- Splits the overloaded `projects` table in two.
--
-- The old `projects` table mirrored Apptivo work orders. It is renamed to
-- `work_orders` (data preserved), freeing the `projects` name for the new
-- delivery projects that tickets now live in.
--
-- Tickets gain a required `project_id` and a per-project sequential `number`,
-- replacing the random org-wide `ticket_number`. Existing tickets are backfilled
-- into either a project derived from their work order, or the organization's
-- internal project.

-- ---------------------------------------------------------------------------
-- 1. Rename the Apptivo table and everything named after it.
-- ---------------------------------------------------------------------------
ALTER TABLE "projects" RENAME TO "work_orders";

ALTER INDEX "projects_pkey" RENAME TO "work_orders_pkey";
ALTER INDEX "projects_organization_id_apptivo_id_key" RENAME TO "work_orders_organization_id_apptivo_id_key";
ALTER INDEX "projects_organization_id_idx" RENAME TO "work_orders_organization_id_idx";
ALTER INDEX "projects_client_id_idx" RENAME TO "work_orders_client_id_idx";

ALTER TABLE "work_orders" RENAME CONSTRAINT "projects_organization_id_fkey" TO "work_orders_organization_id_fkey";
ALTER TABLE "work_orders" RENAME CONSTRAINT "projects_client_id_fkey" TO "work_orders_client_id_fkey";
ALTER TABLE "work_orders" RENAME CONSTRAINT "projects_apptivo_id_not_null" TO "work_orders_apptivo_id_not_null";
ALTER TABLE "work_orders" RENAME CONSTRAINT "projects_created_at_not_null" TO "work_orders_created_at_not_null";
ALTER TABLE "work_orders" RENAME CONSTRAINT "projects_customer_name_not_null" TO "work_orders_customer_name_not_null";
ALTER TABLE "work_orders" RENAME CONSTRAINT "projects_id_not_null" TO "work_orders_id_not_null";
ALTER TABLE "work_orders" RENAME CONSTRAINT "projects_organization_id_not_null" TO "work_orders_organization_id_not_null";
ALTER TABLE "work_orders" RENAME CONSTRAINT "projects_status_not_null" TO "work_orders_status_not_null";
ALTER TABLE "work_orders" RENAME CONSTRAINT "projects_total_not_null" TO "work_orders_total_not_null";
ALTER TABLE "work_orders" RENAME CONSTRAINT "projects_updated_at_not_null" TO "work_orders_updated_at_not_null";
ALTER TABLE "work_orders" RENAME CONSTRAINT "projects_work_order_number_not_null" TO "work_orders_work_order_number_not_null";

-- Soft-delete columns: the Apptivo sync archives instead of purging.
ALTER TABLE "work_orders"
  ADD COLUMN "is_archived" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "archived_at" TIMESTAMP(3);

CREATE INDEX "work_orders_is_archived_idx" ON "work_orders"("is_archived");

-- ---------------------------------------------------------------------------
-- 2. Repoint the foreign keys that referenced the old table.
-- ---------------------------------------------------------------------------
ALTER TABLE "sla_policies" RENAME COLUMN "project_id" TO "work_order_id";
ALTER TABLE "sla_policies" RENAME CONSTRAINT "sla_policies_project_id_fkey" TO "sla_policies_work_order_id_fkey";

ALTER TABLE "timesheet_entries" RENAME COLUMN "project_id" TO "work_order_id";
ALTER TABLE "timesheet_entries" RENAME CONSTRAINT "timesheet_entries_project_id_fkey" TO "timesheet_entries_work_order_id_fkey";
ALTER TABLE "timesheet_entries" RENAME CONSTRAINT "timesheet_entries_project_id_not_null" TO "timesheet_entries_work_order_id_not_null";
ALTER INDEX "timesheet_entries_project_id_idx" RENAME TO "timesheet_entries_work_order_id_idx";
ALTER INDEX "timesheet_entries_organization_id_project_id_work_date_idx" RENAME TO "timesheet_entries_organization_id_work_order_id_work_date_idx";

-- Tickets keep an optional work order link for client/billing context.
ALTER TABLE "tickets" RENAME COLUMN "project_id" TO "work_order_id";
ALTER TABLE "tickets" RENAME CONSTRAINT "tickets_project_id_fkey" TO "tickets_work_order_id_fkey";
ALTER INDEX "tickets_project_id_idx" RENAME TO "tickets_work_order_id_idx";

-- ---------------------------------------------------------------------------
-- 3. Create the new delivery-project tables.
-- ---------------------------------------------------------------------------
CREATE TYPE "ProjectState" AS ENUM ('BACKLOG', 'PLANNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELED');

CREATE TABLE "projects" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "description" TEXT,
    "state" "ProjectState" NOT NULL DEFAULT 'BACKLOG',
    "priority" "TicketPriority",
    "start_date" TIMESTAMP(3),
    "target_date" TIMESTAMP(3),
    "is_internal" BOOLEAN NOT NULL DEFAULT false,
    "is_archived" BOOLEAN NOT NULL DEFAULT false,
    "next_ticket_number" INTEGER NOT NULL DEFAULT 1,
    "organization_id" TEXT NOT NULL,
    "lead_member_id" TEXT,
    "work_order_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "projects_organization_id_key_key" ON "projects"("organization_id", "key");
CREATE INDEX "projects_organization_id_idx" ON "projects"("organization_id");
CREATE INDEX "projects_lead_member_id_idx" ON "projects"("lead_member_id");
CREATE INDEX "projects_work_order_id_idx" ON "projects"("work_order_id");
CREATE INDEX "projects_is_archived_idx" ON "projects"("is_archived");

-- Prisma cannot express a filtered unique, so the "one internal project per
-- organization" rule is enforced here.
CREATE UNIQUE INDEX "projects_one_internal_per_organization"
  ON "projects"("organization_id") WHERE "is_internal";

ALTER TABLE "projects" ADD CONSTRAINT "projects_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "projects" ADD CONSTRAINT "projects_lead_member_id_fkey"
  FOREIGN KEY ("lead_member_id") REFERENCES "members"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "projects" ADD CONSTRAINT "projects_work_order_id_fkey"
  FOREIGN KEY ("work_order_id") REFERENCES "work_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "project_members" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "member_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_members_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "project_members_project_id_member_id_key" ON "project_members"("project_id", "member_id");
CREATE INDEX "project_members_project_id_idx" ON "project_members"("project_id");
CREATE INDEX "project_members_member_id_idx" ON "project_members"("member_id");

ALTER TABLE "project_members" ADD CONSTRAINT "project_members_project_id_fkey"
  FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_member_id_fkey"
  FOREIGN KEY ("member_id") REFERENCES "members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- 4. Backfill: every organization gets an internal project, and every work
--    order that already has tickets gets a project to hold them.
-- ---------------------------------------------------------------------------
INSERT INTO "projects" ("id", "name", "key", "description", "is_internal", "organization_id", "updated_at")
SELECT
    gen_random_uuid()::text,
    o."name" || ' - Internal',
    'INT',
    'Work that is not tied to a client, such as internal IT requests.',
    true,
    o."id",
    CURRENT_TIMESTAMP
FROM "organizations" o;

-- One project per work order that has tickets. The key is derived from the
-- work order number and de-duplicated with a row number, since project keys are
-- unique per organization.
INSERT INTO "projects" ("id", "name", "key", "state", "organization_id", "work_order_id", "updated_at")
SELECT
    gen_random_uuid()::text,
    COALESCE(NULLIF(w."work_order_number", ''), 'Work order'),
    'WO' || ROW_NUMBER() OVER (PARTITION BY w."organization_id" ORDER BY w."created_at"),
    'IN_PROGRESS',
    w."organization_id",
    w."id",
    CURRENT_TIMESTAMP
FROM "work_orders" w
WHERE EXISTS (SELECT 1 FROM "tickets" t WHERE t."work_order_id" = w."id");

-- ---------------------------------------------------------------------------
-- 5. Move tickets into projects and renumber them per project.
-- ---------------------------------------------------------------------------
ALTER TABLE "tickets" ADD COLUMN "project_id" TEXT;
ALTER TABLE "tickets" ADD COLUMN "number" INTEGER;

UPDATE "tickets" t
SET "project_id" = p."id"
FROM "projects" p
WHERE p."work_order_id" = t."work_order_id";

UPDATE "tickets" t
SET "project_id" = p."id"
FROM "projects" p
WHERE t."project_id" IS NULL
  AND p."organization_id" = t."organization_id"
  AND p."is_internal";

-- The old ticket_number values were random and org-scoped; they are discarded in
-- favour of a stable per-project sequence ordered by creation date.
UPDATE "tickets" t
SET "number" = numbered."seq"
FROM (
    SELECT "id", ROW_NUMBER() OVER (PARTITION BY "project_id" ORDER BY "created_at", "id") AS "seq"
    FROM "tickets"
) numbered
WHERE numbered."id" = t."id";

UPDATE "projects" p
SET "next_ticket_number" = COALESCE(
    (SELECT MAX(t."number") + 1 FROM "tickets" t WHERE t."project_id" = p."id"),
    1
);

ALTER TABLE "tickets" ALTER COLUMN "project_id" SET NOT NULL;
ALTER TABLE "tickets" ALTER COLUMN "number" SET NOT NULL;

DROP INDEX "tickets_organization_id_ticket_number_key";
ALTER TABLE "tickets" DROP COLUMN "ticket_number";

CREATE UNIQUE INDEX "tickets_project_id_number_key" ON "tickets"("project_id", "number");
CREATE INDEX "tickets_project_id_idx" ON "tickets"("project_id");

ALTER TABLE "tickets" ADD CONSTRAINT "tickets_project_id_fkey"
  FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
