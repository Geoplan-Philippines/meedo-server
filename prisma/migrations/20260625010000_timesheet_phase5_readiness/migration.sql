-- Timesheet Phase 5 performance indexes for summary, export, approval filters, and audit-log review.
CREATE INDEX "timesheet_entries_organization_id_work_date_status_idx" ON "timesheet_entries"("organization_id", "work_date", "status");
CREATE INDEX "timesheet_entries_organization_id_project_id_work_date_idx" ON "timesheet_entries"("organization_id", "project_id", "work_date");
CREATE INDEX "timesheet_entries_organization_id_status_work_date_idx" ON "timesheet_entries"("organization_id", "status", "work_date");
CREATE INDEX "timesheet_audit_logs_organization_id_created_at_idx" ON "timesheet_audit_logs"("organization_id", "created_at");
