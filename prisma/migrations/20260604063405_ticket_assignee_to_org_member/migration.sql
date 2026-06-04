/*
  Warnings:

  - A unique constraint covering the columns `[prefix]` on the table `organizations` will be added. If there are existing duplicate values, this will fail.

*/
-- DropForeignKey
ALTER TABLE "tickets" DROP CONSTRAINT "tickets_assignee_id_fkey";

-- AlterTable
ALTER TABLE "organizations" ADD COLUMN     "prefix" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "organizations_prefix_key" ON "organizations"("prefix");

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_assignee_id_fkey" FOREIGN KEY ("assignee_id") REFERENCES "members"("id") ON DELETE SET NULL ON UPDATE CASCADE;
