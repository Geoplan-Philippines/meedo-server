-- CreateEnum
CREATE TYPE "HolidayType" AS ENUM ('REGULAR', 'SPECIAL_NON_WORKING', 'SPECIAL_WORKING');

-- CreateEnum
CREATE TYPE "DayOfWeek" AS ENUM ('SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY');

-- CreateTable
CREATE TABLE "attendance_policies" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Manila',
    "auto_clock_out_enabled" BOOLEAN NOT NULL DEFAULT true,
    "auto_clock_out_time" TEXT NOT NULL DEFAULT '18:00',
    "standard_hours_per_day" DOUBLE PRECISION NOT NULL DEFAULT 8,
    "standard_hours_per_week" DOUBLE PRECISION NOT NULL DEFAULT 40,
    "max_hours_per_day" DOUBLE PRECISION NOT NULL DEFAULT 24,
    "grace_minutes" INTEGER NOT NULL DEFAULT 15,
    "lunch_minutes" INTEGER NOT NULL DEFAULT 60,
    "lunch_is_paid" BOOLEAN NOT NULL DEFAULT false,
    "overtime_after_hours_per_day" DOUBLE PRECISION NOT NULL DEFAULT 8,
    "minimum_overtime_minutes" INTEGER NOT NULL DEFAULT 30,
    "overtime_multiplier" DOUBLE PRECISION NOT NULL DEFAULT 1.25,
    "rest_day_multiplier" DOUBLE PRECISION NOT NULL DEFAULT 1.30,
    "night_differential_multiplier" DOUBLE PRECISION NOT NULL DEFAULT 0.10,
    "night_differential_start" TEXT NOT NULL DEFAULT '22:00',
    "night_differential_end" TEXT NOT NULL DEFAULT '06:00',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "attendance_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shifts" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "start_time" TEXT NOT NULL,
    "end_time" TEXT NOT NULL,
    "break_minutes" INTEGER NOT NULL DEFAULT 60,
    "grace_minutes" INTEGER,
    "crosses_midnight" BOOLEAN NOT NULL DEFAULT false,
    "is_flexible" BOOLEAN NOT NULL DEFAULT false,
    "color" TEXT DEFAULT '#6B7280',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_archived" BOOLEAN NOT NULL DEFAULT false,
    "organization_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shifts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "weekly_schedules" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_archived" BOOLEAN NOT NULL DEFAULT false,
    "organization_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "weekly_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "weekly_schedule_days" (
    "id" TEXT NOT NULL,
    "weekly_schedule_id" TEXT NOT NULL,
    "day_of_week" "DayOfWeek" NOT NULL,
    "is_working_day" BOOLEAN NOT NULL DEFAULT true,
    "expected_source" "AttendanceSource",
    "shift_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "weekly_schedule_days_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "holidays" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "type" "HolidayType" NOT NULL DEFAULT 'REGULAR',
    "is_recurring" BOOLEAN NOT NULL DEFAULT false,
    "organization_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "holidays_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "team_schedule_assignments" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "team_id" TEXT NOT NULL,
    "weekly_schedule_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "team_schedule_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_schedule_assignments" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "weekly_schedule_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employee_schedule_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "attendance_policies_organization_id_key" ON "attendance_policies"("organization_id");

-- CreateIndex
CREATE INDEX "shifts_organization_id_idx" ON "shifts"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "shifts_organization_id_name_key" ON "shifts"("organization_id", "name");

-- CreateIndex
CREATE INDEX "weekly_schedules_organization_id_idx" ON "weekly_schedules"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "weekly_schedules_organization_id_name_key" ON "weekly_schedules"("organization_id", "name");

-- CreateIndex
CREATE INDEX "weekly_schedule_days_weekly_schedule_id_idx" ON "weekly_schedule_days"("weekly_schedule_id");

-- CreateIndex
CREATE UNIQUE INDEX "weekly_schedule_days_weekly_schedule_id_day_of_week_key" ON "weekly_schedule_days"("weekly_schedule_id", "day_of_week");

-- CreateIndex
CREATE INDEX "holidays_organization_id_idx" ON "holidays"("organization_id");

-- CreateIndex
CREATE INDEX "holidays_organization_id_date_idx" ON "holidays"("organization_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "holidays_organization_id_date_name_key" ON "holidays"("organization_id", "date", "name");

-- CreateIndex
CREATE UNIQUE INDEX "team_schedule_assignments_team_id_key" ON "team_schedule_assignments"("team_id");

-- CreateIndex
CREATE INDEX "team_schedule_assignments_organization_id_idx" ON "team_schedule_assignments"("organization_id");

-- CreateIndex
CREATE INDEX "team_schedule_assignments_weekly_schedule_id_idx" ON "team_schedule_assignments"("weekly_schedule_id");

-- CreateIndex
CREATE INDEX "employee_schedule_assignments_organization_id_idx" ON "employee_schedule_assignments"("organization_id");

-- CreateIndex
CREATE INDEX "employee_schedule_assignments_user_id_idx" ON "employee_schedule_assignments"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "employee_schedule_assignments_organization_id_user_id_key" ON "employee_schedule_assignments"("organization_id", "user_id");

-- AddForeignKey
ALTER TABLE "attendance_policies" ADD CONSTRAINT "attendance_policies_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "weekly_schedules" ADD CONSTRAINT "weekly_schedules_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "weekly_schedule_days" ADD CONSTRAINT "weekly_schedule_days_weekly_schedule_id_fkey" FOREIGN KEY ("weekly_schedule_id") REFERENCES "weekly_schedules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "weekly_schedule_days" ADD CONSTRAINT "weekly_schedule_days_shift_id_fkey" FOREIGN KEY ("shift_id") REFERENCES "shifts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "holidays" ADD CONSTRAINT "holidays_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_schedule_assignments" ADD CONSTRAINT "team_schedule_assignments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_schedule_assignments" ADD CONSTRAINT "team_schedule_assignments_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_schedule_assignments" ADD CONSTRAINT "team_schedule_assignments_weekly_schedule_id_fkey" FOREIGN KEY ("weekly_schedule_id") REFERENCES "weekly_schedules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_schedule_assignments" ADD CONSTRAINT "employee_schedule_assignments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_schedule_assignments" ADD CONSTRAINT "employee_schedule_assignments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_schedule_assignments" ADD CONSTRAINT "employee_schedule_assignments_weekly_schedule_id_fkey" FOREIGN KEY ("weekly_schedule_id") REFERENCES "weekly_schedules"("id") ON DELETE CASCADE ON UPDATE CASCADE;
