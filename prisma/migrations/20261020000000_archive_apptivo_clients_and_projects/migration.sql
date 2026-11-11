/*
  Apptivo sync no longer hard-deletes clients or projects; rows missing from
  Apptivo are archived instead. Clients are identified by (organization_id,
  apptivo_id) only, so the customer_name uniqueness rule is dropped (renames
  and near-duplicate names are legitimate in Apptivo).

  Existing rows get is_archived = false via the column default.
*/

-- DropConstraint: created with ALTER TABLE ... ADD CONSTRAINT in
-- 20260727000000_drop_customer_name_from_projects, so it must be dropped as a
-- constraint. The DROP INDEX covers databases where it exists as a bare index.
ALTER TABLE "clients" DROP CONSTRAINT IF EXISTS "clients_organization_id_customer_name_key";
DROP INDEX IF EXISTS "clients_organization_id_customer_name_key";

-- AlterTable
ALTER TABLE "clients" ADD COLUMN     "archived_at" TIMESTAMP(3),
ADD COLUMN     "is_archived" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "projects" ADD COLUMN     "archived_at" TIMESTAMP(3),
ADD COLUMN     "is_archived" BOOLEAN NOT NULL DEFAULT false;
