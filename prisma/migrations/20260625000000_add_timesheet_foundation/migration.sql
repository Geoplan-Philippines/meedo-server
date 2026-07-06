-- CreateEnum
CREATE TYPE "TimesheetEntryStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "TimesheetWorkType" AS ENUM ('OFFICE', 'OFFICE_DIRECT_WORK', 'FIELD', 'WFH', 'LEAVE', 'OFFSET', 'HOLIDAY');

-- CreateEnum
CREATE TYPE "TimesheetAuditAction" AS ENUM ('CREATED', 'UPDATED', 'DELETED', 'SUBMITTED', 'APPROVED', 'REJECTED', 'LOCKED_PERIOD', 'UNLOCKED_PERIOD', 'EXPORTED');

-- CreateTable
CREATE TABLE "timesheet_entries" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "project_id" TEXT NOT NULL,
  "work_date" TIMESTAMP(3) NOT NULL,
  "hours" DOUBLE PRECISION NOT NULL,
  "location" TEXT NOT NULL DEFAULT 'OFC - DW',
  "work_type" "TimesheetWorkType" NOT NULL DEFAULT 'OFFICE_DIRECT_WORK',
  "task" TEXT NOT NULL,
  "project_description" TEXT,
  "is_overtime" BOOLEAN NOT NULL DEFAULT false,
  "is_night_differential" BOOLEAN NOT NULL DEFAULT false,
  "status" "TimesheetEntryStatus" NOT NULL DEFAULT 'DRAFT',
  "submitted_at" TIMESTAMP(3),
  "approved_at" TIMESTAMP(3),
  "approved_by_member_id" TEXT,
  "rejected_at" TIMESTAMP(3),
  "rejected_by_member_id" TEXT,
  "rejection_reason" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "timesheet_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "timesheet_period_locks" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "period_start" TIMESTAMP(3) NOT NULL,
  "period_end" TIMESTAMP(3) NOT NULL,
  "is_locked" BOOLEAN NOT NULL DEFAULT false,
  "locked_at" TIMESTAMP(3),
  "locked_by_member_id" TEXT,
  "unlocked_at" TIMESTAMP(3),
  "unlocked_by_member_id" TEXT,
  "unlock_reason" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "timesheet_period_locks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "timesheet_audit_logs" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "actor_member_id" TEXT,
  "target_user_id" TEXT,
  "timesheet_entry_id" TEXT,
  "action" "TimesheetAuditAction" NOT NULL,
  "before" JSONB,
  "after" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "timesheet_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "timesheet_entries_organization_id_idx" ON "timesheet_entries"("organization_id");

-- CreateIndex
CREATE INDEX "timesheet_entries_user_id_idx" ON "timesheet_entries"("user_id");

-- CreateIndex
CREATE INDEX "timesheet_entries_project_id_idx" ON "timesheet_entries"("project_id");

-- CreateIndex
CREATE INDEX "timesheet_entries_organization_id_user_id_work_date_idx" ON "timesheet_entries"("organization_id", "user_id", "work_date");

-- CreateIndex
CREATE INDEX "timesheet_entries_organization_id_work_date_idx" ON "timesheet_entries"("organization_id", "work_date");

-- CreateIndex
CREATE INDEX "timesheet_entries_status_idx" ON "timesheet_entries"("status");

-- CreateIndex
CREATE INDEX "timesheet_period_locks_organization_id_idx" ON "timesheet_period_locks"("organization_id");

-- CreateIndex
CREATE INDEX "timesheet_period_locks_is_locked_idx" ON "timesheet_period_locks"("is_locked");

-- CreateIndex
CREATE UNIQUE INDEX "timesheet_period_locks_organization_id_period_start_period_end_key" ON "timesheet_period_locks"("organization_id", "period_start", "period_end");

-- CreateIndex
CREATE INDEX "timesheet_audit_logs_organization_id_idx" ON "timesheet_audit_logs"("organization_id");

-- CreateIndex
CREATE INDEX "timesheet_audit_logs_actor_member_id_idx" ON "timesheet_audit_logs"("actor_member_id");

-- CreateIndex
CREATE INDEX "timesheet_audit_logs_target_user_id_idx" ON "timesheet_audit_logs"("target_user_id");

-- CreateIndex
CREATE INDEX "timesheet_audit_logs_timesheet_entry_id_idx" ON "timesheet_audit_logs"("timesheet_entry_id");

-- CreateIndex
CREATE INDEX "timesheet_audit_logs_action_idx" ON "timesheet_audit_logs"("action");

-- AddForeignKey
ALTER TABLE "timesheet_entries" ADD CONSTRAINT "timesheet_entries_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timesheet_entries" ADD CONSTRAINT "timesheet_entries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timesheet_entries" ADD CONSTRAINT "timesheet_entries_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timesheet_entries" ADD CONSTRAINT "timesheet_entries_approved_by_member_id_fkey" FOREIGN KEY ("approved_by_member_id") REFERENCES "members"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timesheet_entries" ADD CONSTRAINT "timesheet_entries_rejected_by_member_id_fkey" FOREIGN KEY ("rejected_by_member_id") REFERENCES "members"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timesheet_period_locks" ADD CONSTRAINT "timesheet_period_locks_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timesheet_period_locks" ADD CONSTRAINT "timesheet_period_locks_locked_by_member_id_fkey" FOREIGN KEY ("locked_by_member_id") REFERENCES "members"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timesheet_period_locks" ADD CONSTRAINT "timesheet_period_locks_unlocked_by_member_id_fkey" FOREIGN KEY ("unlocked_by_member_id") REFERENCES "members"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timesheet_audit_logs" ADD CONSTRAINT "timesheet_audit_logs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timesheet_audit_logs" ADD CONSTRAINT "timesheet_audit_logs_actor_member_id_fkey" FOREIGN KEY ("actor_member_id") REFERENCES "members"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timesheet_audit_logs" ADD CONSTRAINT "timesheet_audit_logs_target_user_id_fkey" FOREIGN KEY ("target_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timesheet_audit_logs" ADD CONSTRAINT "timesheet_audit_logs_timesheet_entry_id_fkey" FOREIGN KEY ("timesheet_entry_id") REFERENCES "timesheet_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;
