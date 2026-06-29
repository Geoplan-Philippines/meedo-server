/*
  Warnings:

  - A unique constraint covering the columns `[employee_code]` on the table `users` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[biometrics_id]` on the table `users` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "AttendanceSource" AS ENUM ('OFFICE', 'FIELD', 'WFH');

-- CreateEnum
CREATE TYPE "AttendanceEventType" AS ENUM ('OFFICE_ACCESS', 'OFFICE_IN', 'OFFICE_OUT', 'FIELD_IN', 'FIELD_OUT', 'WFH_IN', 'WFH_OUT');

-- CreateEnum
CREATE TYPE "AttendanceOrigin" AS ENUM ('BIOMETRICS', 'MANUAL', 'AUTO');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "biometrics_id" TEXT,
ADD COLUMN     "employee_code" TEXT;

-- CreateTable
CREATE TABLE "attendance_events" (
    "id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "source" "AttendanceSource" NOT NULL,
    "event_type" "AttendanceEventType" NOT NULL,
    "origin" "AttendanceOrigin" NOT NULL,
    "external_id" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "attendance_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendances" (
    "id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "first_in" TIMESTAMP(3),
    "last_out" TIMESTAMP(3),
    "billable_hours" DOUBLE PRECISION,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "attendances_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "attendance_events_external_id_key" ON "attendance_events"("external_id");

-- CreateIndex
CREATE INDEX "attendance_events_employee_id_idx" ON "attendance_events"("employee_id");

-- CreateIndex
CREATE INDEX "attendance_events_timestamp_idx" ON "attendance_events"("timestamp");

-- CreateIndex
CREATE INDEX "attendance_events_employee_id_timestamp_idx" ON "attendance_events"("employee_id", "timestamp");

-- CreateIndex
CREATE INDEX "attendances_employee_id_idx" ON "attendances"("employee_id");

-- CreateIndex
CREATE UNIQUE INDEX "attendances_employee_id_date_key" ON "attendances"("employee_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "users_employee_code_key" ON "users"("employee_code");

-- CreateIndex
CREATE UNIQUE INDEX "users_biometrics_id_key" ON "users"("biometrics_id");

-- AddForeignKey
ALTER TABLE "attendance_events" ADD CONSTRAINT "attendance_events_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendances" ADD CONSTRAINT "attendances_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
