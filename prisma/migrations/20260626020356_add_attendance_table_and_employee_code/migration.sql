/*
  Warnings:

  - A unique constraint covering the columns `[employee_code]` on the table `users` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "AttendanceSource" AS ENUM ('OFFICE', 'FIELD', 'WFH');

-- CreateEnum
CREATE TYPE "AttendanceEventType" AS ENUM ('OFFICE_ACCESS', 'OFFICE_IN', 'OFFICE_OUT', 'FIELD_IN', 'FIELD_OUT', 'WFH_IN', 'WFH_OUT');

-- CreateEnum
CREATE TYPE "AttendanceOrigin" AS ENUM ('BIOMETRICS', 'MANUAL', 'AUTO');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "employee_code" TEXT;

-- CreateTable
CREATE TABLE "AttendanceEvent" (
    "id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "source" "AttendanceSource" NOT NULL,
    "event_type" "AttendanceEventType" NOT NULL,
    "origin" "AttendanceOrigin" NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AttendanceEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attendance" (
    "id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "first_in" TIMESTAMP(3),
    "last_out" TIMESTAMP(3),
    "billable_hours" DOUBLE PRECISION,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Attendance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AttendanceEvent_employee_id_idx" ON "AttendanceEvent"("employee_id");

-- CreateIndex
CREATE INDEX "AttendanceEvent_timestamp_idx" ON "AttendanceEvent"("timestamp");

-- CreateIndex
CREATE INDEX "AttendanceEvent_employee_id_timestamp_idx" ON "AttendanceEvent"("employee_id", "timestamp");

-- CreateIndex
CREATE INDEX "Attendance_employee_id_idx" ON "Attendance"("employee_id");

-- CreateIndex
CREATE UNIQUE INDEX "Attendance_employee_id_date_key" ON "Attendance"("employee_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "users_employee_code_key" ON "users"("employee_code");

-- AddForeignKey
ALTER TABLE "AttendanceEvent" ADD CONSTRAINT "AttendanceEvent_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attendance" ADD CONSTRAINT "Attendance_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
