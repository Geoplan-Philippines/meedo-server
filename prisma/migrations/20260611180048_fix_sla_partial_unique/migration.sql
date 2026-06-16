-- DropIndex (full unique that blocks archived rows)
DROP INDEX "sla_policies_organization_id_project_id_key";

-- CreateIndex (partial unique: only enforced on non-archived rows)
CREATE UNIQUE INDEX "sla_policies_organization_id_project_id_key"
  ON "sla_policies"("organization_id", "project_id")
  WHERE "is_archived" = false;

-- CreateIndex
CREATE INDEX "sla_policies_is_archived_idx" ON "sla_policies"("is_archived");