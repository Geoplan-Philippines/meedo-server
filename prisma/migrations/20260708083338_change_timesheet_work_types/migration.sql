/*
  Warnings:

  - The values [OFFICE,OFFICE_DIRECT_WORK,FIELD,WFH,HOLIDAY] on the enum `TimesheetWorkType` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "TimesheetWorkType_new" AS ENUM ('REGULAR', 'REST_DAY', 'LEAVE', 'OFFSET');
ALTER TABLE "public"."timesheet_entries" ALTER COLUMN "work_type" DROP DEFAULT;
ALTER TABLE "timesheet_entries" ALTER COLUMN "work_type" TYPE "TimesheetWorkType_new" USING ("work_type"::text::"TimesheetWorkType_new");
ALTER TYPE "TimesheetWorkType" RENAME TO "TimesheetWorkType_old";
ALTER TYPE "TimesheetWorkType_new" RENAME TO "TimesheetWorkType";
DROP TYPE "public"."TimesheetWorkType_old";
ALTER TABLE "timesheet_entries" ALTER COLUMN "work_type" SET DEFAULT 'REGULAR';
COMMIT;

-- AlterTable
ALTER TABLE "timesheet_entries" ALTER COLUMN "work_type" SET DEFAULT 'REGULAR';

-- RenameIndex
ALTER INDEX "timesheet_period_locks_organization_id_period_start_period_end_" RENAME TO "timesheet_period_locks_organization_id_period_start_period__key";
