/*
  Admin-owned display names for projects and clients, a lock that stops the
  Apptivo sync from replacing a hand-set project client, and an audit table for
  those edits. The sync never writes display_name or client_locked.

  Existing rows get display_name = NULL and client_locked = false, so every
  project and client keeps showing its Apptivo name until an admin edits it.
*/

-- CreateEnum
CREATE TYPE "MaintenanceAuditEntity" AS ENUM ('PROJECT', 'CLIENT');

-- AlterTable
ALTER TABLE "clients" ADD COLUMN     "display_name" TEXT;

-- AlterTable
ALTER TABLE "projects" ADD COLUMN     "client_locked" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "display_name" TEXT;

-- CreateTable
CREATE TABLE "maintenance_audit_logs" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "entity_type" "MaintenanceAuditEntity" NOT NULL,
    "entity_id" TEXT NOT NULL,
    "actor_member_id" TEXT,
    "changes" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "maintenance_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "maintenance_audit_logs_organization_id_entity_type_entity_i_idx" ON "maintenance_audit_logs"("organization_id", "entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "maintenance_audit_logs_actor_member_id_idx" ON "maintenance_audit_logs"("actor_member_id");

-- AddForeignKey
ALTER TABLE "maintenance_audit_logs" ADD CONSTRAINT "maintenance_audit_logs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_audit_logs" ADD CONSTRAINT "maintenance_audit_logs_actor_member_id_fkey" FOREIGN KEY ("actor_member_id") REFERENCES "members"("id") ON DELETE SET NULL ON UPDATE CASCADE;
