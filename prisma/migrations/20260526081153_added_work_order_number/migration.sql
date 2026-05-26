/*
  Warnings:

  - Added the required column `work_order_number` to the `projects` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "projects" ADD COLUMN     "work_order_number" TEXT NOT NULL;
